//! Small Node-API v1 surface. No V8 ABI, Node headers or third-party crates.
//! Functions are resolved from the running Node process, including on Windows,
//! where this avoids downloading a node.lib import library during installation.
use std::ffi::{c_char, c_void};
use std::ptr;
use std::sync::OnceLock;

pub type Env = *mut c_void;
pub type Value = *mut c_void;
pub type Info = *mut c_void;
pub type Callback = unsafe extern "C" fn(Env, Info) -> Value;
type Status = i32;
pub type Result<T> = std::result::Result<T, ()>;
pub const UNDEFINED: i32 = 0;
pub const NULL: i32 = 1;
pub const STRING: i32 = 4;
pub const SYMBOL: i32 = 5;

#[cfg(unix)]
unsafe fn symbol(name: *const c_char) -> *mut c_void {
    #[cfg_attr(not(target_os = "macos"), link(name = "dl"))]
    extern "C" {
        fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
    }
    #[cfg(target_os = "macos")]
    let handle = -2isize as *mut c_void; // RTLD_DEFAULT in Darwin's dlfcn.h
    #[cfg(not(target_os = "macos"))]
    let handle = ptr::null_mut(); // RTLD_DEFAULT on Linux
    unsafe { dlsym(handle, name) }
}

#[cfg(windows)]
unsafe fn symbol(name: *const c_char) -> *mut c_void {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const c_char) -> *mut c_void;
    }
    unsafe { GetProcAddress(GetModuleHandleW(ptr::null()), name) }
}

macro_rules! api {
    ($($name:ident($($arg:ty),*)),* $(,)?) => {
        pub struct Api {
            $(pub $name: unsafe extern "C" fn($($arg),*) -> Status,)*
        }
        impl Api {
            unsafe fn load() -> Option<Self> {
                Some(Self {
                    $($name: {
                        let address = unsafe { symbol(concat!(stringify!($name), "\0").as_ptr().cast()) };
                        if address.is_null() { return None; }
                        // SAFETY: each signature below matches the named Node-API
                        // v1 C function; the host owns the symbol for our lifetime.
                        unsafe { std::mem::transmute::<*mut c_void, unsafe extern "C" fn($($arg),*) -> Status>(address) }
                    },)*
                })
            }
        }
    };
}

api! {
    napi_get_cb_info(Env, Info, *mut usize, *mut Value, *mut Value, *mut *mut c_void),
    napi_create_function(Env, *const c_char, usize, Option<Callback>, *mut c_void, *mut Value),
    napi_create_uint32(Env, u32, *mut Value),
    napi_create_string_utf8(Env, *const c_char, usize, *mut Value),
    napi_get_undefined(Env, *mut Value),
    napi_get_boolean(Env, bool, *mut Value),
    napi_typeof(Env, Value, *mut i32),
    napi_is_array(Env, Value, *mut bool),
    napi_get_array_length(Env, Value, *mut u32),
    napi_get_element(Env, Value, u32, *mut Value),
    napi_get_property(Env, Value, Value, *mut Value),
    napi_get_named_property(Env, Value, *const c_char, *mut Value),
    napi_set_named_property(Env, Value, *const c_char, Value),
    napi_create_object(Env, *mut Value),
    napi_coerce_to_object(Env, Value, *mut Value),
    napi_coerce_to_string(Env, Value, *mut Value),
    napi_coerce_to_bool(Env, Value, *mut Value),
    napi_get_value_bool(Env, Value, *mut bool),
    napi_strict_equals(Env, Value, Value, *mut bool),
    napi_call_function(Env, Value, Value, usize, *const Value, *mut Value),
    napi_is_exception_pending(Env, *mut bool),
    napi_throw_error(Env, *const c_char, *const c_char),
}

static API: OnceLock<Option<Api>> = OnceLock::new();

pub fn api() -> Option<&'static Api> {
    // Only immutable function addresses are shared across Node workers. No env,
    // napi_value, JS callback or other handle outlives its synchronous invocation.
    API.get_or_init(|| unsafe { Api::load() }).as_ref()
}

fn checked(status: Status) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        Err(())
    }
}

pub struct Js {
    env: Env,
    api: &'static Api,
}

impl Js {
    /// # Safety
    /// env must be the live environment for the current Node callback.
    pub unsafe fn new(env: Env, api: &'static Api) -> Self {
        Self { env, api }
    }

    // All output pointers below refer to initialized stack values. All input
    // handles come from Node in this callback's handle scope; every status is
    // checked before a returned handle is used. Node retains pending exceptions.
    pub fn output<T: Default>(&self, f: impl FnOnce(*mut T) -> Status) -> Result<T> {
        let mut result = T::default();
        checked(f(&mut result))?;
        Ok(result)
    }

    pub fn args<const N: usize>(&self, info: Info) -> Result<[Value; N]> {
        let mut values = [ptr::null_mut(); N];
        let mut count = N;
        checked(unsafe {
            (self.api.napi_get_cb_info)(
                self.env,
                info,
                &mut count,
                values.as_mut_ptr(),
                ptr::null_mut(),
                ptr::null_mut(),
            )
        })?;
        if count != N {
            return Err(());
        }
        Ok(values)
    }

    pub fn kind(&self, value: Value) -> Result<i32> {
        self.output(|out| unsafe { (self.api.napi_typeof)(self.env, value, out) })
    }

    pub fn is_array(&self, value: Value) -> Result<bool> {
        self.output(|out| unsafe { (self.api.napi_is_array)(self.env, value, out) })
    }

    pub fn len(&self, value: Value) -> Result<u32> {
        self.output(|out| unsafe { (self.api.napi_get_array_length)(self.env, value, out) })
    }

    pub fn element(&self, value: Value, index: u32) -> Result<Value> {
        self.output(|out| unsafe { (self.api.napi_get_element)(self.env, value, index, out) })
    }

    pub fn named(&self, value: Value, name: &std::ffi::CStr) -> Result<Value> {
        let object = self.object(value)?;
        self.output(|out| unsafe {
            (self.api.napi_get_named_property)(self.env, object, name.as_ptr(), out)
        })
    }

    pub fn property(&self, value: Value, key: Value) -> Result<Value> {
        let object = self.object(value)?;
        let key = if matches!(self.kind(key)?, STRING | SYMBOL) {
            key
        } else {
            self.output(|out| unsafe { (self.api.napi_coerce_to_string)(self.env, key, out) })?
        };
        self.output(|out| unsafe { (self.api.napi_get_property)(self.env, object, key, out) })
    }

    fn object(&self, value: Value) -> Result<Value> {
        self.output(|out| unsafe { (self.api.napi_coerce_to_object)(self.env, value, out) })
    }

    pub fn equal(&self, a: Value, b: Value) -> Result<bool> {
        self.output(|out| unsafe { (self.api.napi_strict_equals)(self.env, a, b, out) })
    }

    pub fn truthy(&self, value: Value) -> Result<bool> {
        let boolean =
            self.output(|out| unsafe { (self.api.napi_coerce_to_bool)(self.env, value, out) })?;
        self.output(|out| unsafe { (self.api.napi_get_value_bool)(self.env, boolean, out) })
    }

    pub fn call(&self, receiver: Value, function: Value, args: &[Value]) -> Result<Value> {
        self.output(|out| unsafe {
            (self.api.napi_call_function)(
                self.env,
                receiver,
                function,
                args.len(),
                args.as_ptr(),
                out,
            )
        })
    }

    pub fn undefined(&self) -> Result<Value> {
        self.output(|out| unsafe { (self.api.napi_get_undefined)(self.env, out) })
    }

    pub fn string(&self, text: &str) -> Result<Value> {
        self.output(|out| unsafe {
            (self.api.napi_create_string_utf8)(self.env, text.as_ptr().cast(), text.len(), out)
        })
    }

    pub fn decision(&self, rule: Value, blocked: bool) -> Result<Value> {
        let object = self.output(|out| unsafe { (self.api.napi_create_object)(self.env, out) })?;
        let blocked =
            self.output(|out| unsafe { (self.api.napi_get_boolean)(self.env, blocked, out) })?;
        self.set(object, c"rule", rule)?;
        self.set(object, c"blocked", blocked)?;
        Ok(object)
    }

    pub fn set(&self, object: Value, name: &std::ffi::CStr, value: Value) -> Result<()> {
        checked(unsafe {
            (self.api.napi_set_named_property)(self.env, object, name.as_ptr(), value)
        })
    }

    pub fn export(&self, exports: Value, name: &std::ffi::CStr, callback: Callback) -> Result<()> {
        let value = self.output(|out| unsafe {
            (self.api.napi_create_function)(
                self.env,
                name.as_ptr(),
                name.to_bytes().len(),
                Some(callback),
                ptr::null_mut(),
                out,
            )
        })?;
        self.set(exports, name, value)
    }

    pub fn version(&self, exports: Value) -> Result<()> {
        let value =
            self.output(|out| unsafe { (self.api.napi_create_uint32)(self.env, 1, out) })?;
        self.set(exports, c"guardCoreAbi", value)
    }

    pub fn fail(&self) -> Value {
        let pending =
            self.output(|out| unsafe { (self.api.napi_is_exception_pending)(self.env, out) });
        if !pending.unwrap_or(true) {
            unsafe {
                (self.api.napi_throw_error)(
                    self.env,
                    ptr::null(),
                    c"Native guard evaluation failed".as_ptr(),
                );
            }
        }
        ptr::null_mut()
    }
}
