//! In-process guard policy core. JavaScript retains compilation and invocation of
//! actual RegExp objects, including stateful g/y flags and UTF-16 strings. No
//! input is serialized, copied to UTF-8, executed as a command or written to disk.
#![deny(unsafe_op_in_unsafe_fn)]

mod node_api;
use node_api::{Env, Info, Js, Result, Value, NULL, STRING, UNDEFINED};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr;

fn matches(js: &Js, rule: Value, tool: Value, input: Value, test: Value) -> Result<bool> {
    let filter = js.named(rule, c"tool")?;
    if js.kind(filter)? != UNDEFINED {
        let accepted = if js.is_array(filter)? {
            // Array.includes uses SameValueZero, unlike strict equality for NaN.
            let includes = js.named(filter, c"includes")?;
            js.truthy(js.call(filter, includes, &[tool])?)?
        } else {
            js.equal(tool, filter)?
        };
        if !accepted {
            return Ok(false);
        }
    }

    // Collect ALL string candidates before testing ANY, as in the JS evaluator.
    // This preserves getter/error ordering, field priority and empty-string
    // behavior. Null input throws only if an applicable rule accesses a field.
    let mut candidates = Vec::new();
    let fields = js.named(rule, c"fields")?;
    if js.is_array(fields)? {
        let mut index = 0;
        while index < js.len(fields)? {
            let field = js.element(fields, index)?;
            let value = js.property(input, field)?;
            if js.kind(value)? == STRING {
                candidates.push(value);
            }
            index += 1;
        }
    } else {
        let field = js.named(rule, c"field")?;
        if js.kind(field)? == STRING {
            let value = js.property(input, field)?;
            if js.kind(value)? == STRING {
                candidates.push(value);
            }
        }
    }

    for candidate in candidates {
        // The callback performs exactly rule.compiled.test(candidate) in V8.
        // Never reset lastIndex, reorder candidates, pre-test later rules, or
        // translate patterns to a different regular expression engine.
        if js.truthy(js.call(js.undefined()?, test, &[rule, candidate])?)? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn first_match(
    js: &Js,
    rules: Value,
    tool: Value,
    input: Value,
    test: Value,
) -> Result<Option<Value>> {
    let mut index = 0;
    while index < js.len(rules)? {
        let rule = js.element(rules, index)?;
        if matches(js, rule, tool, input, test)? {
            return Ok(Some(rule));
        }
        index += 1;
    }
    Ok(None)
}

fn evaluate(js: &Js, info: Info) -> Result<Value> {
    let [permanent, beginner, sensitive, tool, input, profile, test] = js.args(info)?;
    if let Some(rule) = first_match(js, permanent, tool, input, test)? {
        return js.decision(rule, true);
    }

    // Read profile.level only after permanent rules have failed to match.
    if !matches!(js.kind(profile)?, NULL | UNDEFINED) {
        let level = js.named(profile, c"level")?;
        if js.equal(level, js.string("beginner")?)? {
            if let Some(rule) = first_match(js, beginner, tool, input, test)? {
                return js.decision(rule, true);
            }
        }
    }

    if let Some(rule) = first_match(js, sensitive, tool, input, test)? {
        return js.decision(rule, false);
    }
    js.undefined()
}

unsafe extern "C" fn evaluate_callback(env: Env, info: Info) -> Value {
    let Some(api) = node_api::api() else {
        return ptr::null_mut();
    };
    // SAFETY: Node supplies a live env/info and invokes synchronously. JS handles
    // never escape the callback, even if V8 throws or a Rust panic is caught.
    let js = unsafe { Js::new(env, api) };
    match catch_unwind(AssertUnwindSafe(|| evaluate(&js, info))) {
        Ok(Ok(value)) => value,
        _ => js.fail(), // JS guard wrapper keeps the documented fail-open policy.
    }
}

/// Node-API v1 entry point, discovered by Node's native module loader.
///
/// # Safety
/// Only Node may call this, with live environment and exports handles.
#[no_mangle]
pub unsafe extern "C" fn napi_register_module_v1(env: Env, exports: Value) -> Value {
    let Some(api) = node_api::api() else {
        return exports;
    };
    let js = unsafe { Js::new(env, api) };
    match catch_unwind(AssertUnwindSafe(|| {
        js.export(exports, c"evaluate", evaluate_callback)?;
        js.version(exports)?;
        Ok::<_, ()>(exports)
    })) {
        Ok(Ok(value)) => value,
        _ => js.fail(),
    }
}
