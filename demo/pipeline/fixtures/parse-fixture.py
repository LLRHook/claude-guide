#!/usr/bin/env python3
"""Parse claude stream-json output and extract the 3-line explanation block."""
import json
import re
import sys


def extract_explanation(filepath):
    with open(filepath) as f:
        lines = f.readlines()

    assistant_text = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_type = obj.get("type", "")

        # Handle full assistant message format
        if msg_type == "assistant":
            content = obj.get("message", {}).get("content", [])
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    assistant_text += block.get("text", "")

        # Handle streaming content_block_delta format
        elif msg_type == "content_block_delta":
            delta = obj.get("delta", {})
            if delta.get("type") == "text_delta":
                assistant_text += delta.get("text", "")

        # Handle result/completion format
        elif msg_type == "result":
            result_text = obj.get("result", "")
            if isinstance(result_text, str):
                assistant_text += result_text

    if not assistant_text:
        return ""

    # Find the three specific explanation lines from the overlay
    # Pattern: lines starting with "> **What I'm about to do**:", "> **In everyday terms**:", "> **What you'll see next**:"
    found = {}
    for line in assistant_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        # Match each of the 3 canonical overlay fields
        if re.search(r"about to do", stripped, re.IGNORECASE) and "about_to_do" not in found:
            # Extract just up to the first period after the field value
            # Remove markdown bold markers **text** -> text
            clean = re.sub(r'\*\*(.*?)\*\*', r'\1', stripped)
            clean = clean.lstrip('> ').strip()
            found["about_to_do"] = clean
        elif re.search(r"In everyday terms", stripped, re.IGNORECASE) and "everyday" not in found:
            clean = re.sub(r'\*\*(.*?)\*\*', r'\1', stripped)
            clean = clean.lstrip('> ').strip()
            found["everyday"] = clean
        elif re.search(r"What you.ll see", stripped, re.IGNORECASE) and "see_next" not in found:
            clean = re.sub(r'\*\*(.*?)\*\*', r'\1', stripped)
            clean = clean.lstrip('> ').strip()
            # Truncate at the end of this single cue - stop at a sentence boundary
            # Remove anything after the first period if it gets too long
            parts = clean.split(". ")
            if len(parts) > 1:
                clean = parts[0] + "."
            found["see_next"] = clean

    if len(found) >= 2:
        result = []
        if "about_to_do" in found:
            result.append(found["about_to_do"])
        if "everyday" in found:
            result.append(found["everyday"])
        if "see_next" in found:
            result.append(found["see_next"])
        return "\n".join(result)

    # Fallback: return first 3 non-empty lines
    non_empty = [l.strip() for l in assistant_text.split("\n") if l.strip()]
    return "\n".join(non_empty[:3])


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: parse-fixture.py <raw-output.json>", file=sys.stderr)
        sys.exit(1)
    result = extract_explanation(sys.argv[1])
    print(result)
