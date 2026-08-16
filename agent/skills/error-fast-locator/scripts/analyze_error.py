#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path


PATTERNS = [
    ("file-not-found", [
        r"no such file or directory",
        r"filenotfounderror",
        r"cannot find the file",
        r"the system cannot find the path specified",
        r"\benoent\b",
    ]),
    ("dns", [
        r"name or service not known",
        r"nodename nor servname provided",
        r"getaddrinfo",
        r"\benotfound\b",
        r"nxdomain",
        r"temporary failure in name resolution",
    ]),
    ("timeout", [
        r"timed out",
        r"timeout",
        r"etimedout",
        r"deadline exceeded",
        r"context deadline exceeded",
    ]),
    ("network", [
        r"connection refused",
        r"connection reset",
        r"socket hang up",
        r"network is unreachable",
        r"proxy error",
        r"tls",
        r"ssl",
        r"certificate",
        r"http error",
    ]),
    ("path-invalid", [
        r"not a valid win32 application",
        r"invalid path",
        r"illegal characters in path",
        r"path does not exist",
    ]),
    ("permission", [
        r"permission denied",
        r"eacces",
        r"eperm",
        r"access is denied",
        r"operation not permitted",
    ]),
    ("command-not-found", [
        r"command not found",
        r"is not recognized as an internal or external command",
        r"executable file not found",
    ]),
    ("import/module-not-found", [
        r"modulenotfounderror",
        r"cannot find module",
        r"no module named",
        r"importerror",
    ]),
    ("auth", [
        r"401",
        r"403",
        r"unauthorized",
        r"forbidden",
        r"authentication failed",
        r"access token",
        r"api key",
    ]),
]


CAUSES = {
    "dns": "Host name could not be resolved. Check hostname spelling, DNS, VPN, proxy, or offline environment.",
    "timeout": "Remote endpoint or local network path did not respond in time. Check reachability, proxy, firewall, and service health.",
    "network": "Network transport failed. Check host, port, proxy, TLS/certificate state, and whether the target service is up.",
    "file-not-found": "Referenced file or directory does not exist from the current working directory or configured path.",
    "path-invalid": "The supplied path is malformed or points to an invalid executable/location for this OS or shell.",
    "permission": "Current user or process lacks permission for the target file, directory, port, or operation.",
    "command-not-found": "Executable is missing or not on PATH, or the shell is using a different environment than expected.",
    "import/module-not-found": "Runtime environment is missing the dependency or using the wrong interpreter/package environment.",
    "auth": "Credentials are missing, expired, wrong for the target endpoint, or blocked by authorization rules.",
    "unknown": "Failure is not recognized by the rule set. Inspect the first explicit error line and nearby stderr context.",
}


CHECKS = {
    "dns": ["Confirm the exact host name.", "Check whether VPN/proxy is required.", "Verify DNS resolution from the current environment."],
    "timeout": ["Confirm the target host and port.", "Check whether the service is reachable.", "Inspect proxy/firewall latency or blocking."],
    "network": ["Confirm URL/host/port.", "Check proxy, TLS, and certificate requirements.", "Verify the remote service is actually running."],
    "file-not-found": ["Print the current working directory.", "Resolve the path to an absolute path.", "Check whether the file was renamed, moved, or never generated."],
    "path-invalid": ["Check path separators and quoting.", "Verify the path exists on this OS.", "Confirm the target is the intended executable or directory."],
    "permission": ["Check file or directory permissions.", "Confirm the process user.", "Retry only after verifying ownership or required privileges."],
    "command-not-found": ["Run a shell lookup for the command.", "Check PATH in the current shell.", "Verify the tool is installed in this environment."],
    "import/module-not-found": ["Check interpreter version.", "Check active virtualenv or package manager context.", "Verify the dependency is installed where the command runs."],
    "auth": ["Confirm the credential source.", "Check token scope or expiry.", "Verify the target endpoint expects that credential."],
    "unknown": ["Read the first explicit error line.", "Capture 3-8 surrounding lines.", "Avoid pasting the full log until the causal line is isolated."],
}


def read_text(file_path: str | None, raw_text: str | None) -> str:
    if raw_text:
        return raw_text
    if file_path:
        return Path(file_path).read_text(encoding="utf-8", errors="replace")
    return sys.stdin.read()


def classify(lines: list[str]) -> tuple[str, list[str]]:
    joined = "\n".join(lines).lower()
    for category, patterns in PATTERNS:
        matches = []
        for pattern in patterns:
            if re.search(pattern, joined, flags=re.IGNORECASE):
                matches.append(pattern)
        if matches:
            return category, matches
    return "unknown", []


def extract_evidence(lines: list[str], matched_patterns: list[str]) -> list[str]:
    evidence = []
    for line in lines:
        lowered = line.lower()
        if any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in matched_patterns):
            cleaned = line.strip()
            if cleaned and cleaned not in evidence:
                evidence.append(cleaned)

    if not evidence:
        for line in lines:
            cleaned = line.strip()
            if not cleaned:
                continue
            if re.search(r"(error|exception|failed|denied|not found|timed out|refused)", cleaned, flags=re.IGNORECASE):
                evidence.append(cleaned)
            if len(evidence) >= 5:
                break
    return evidence[:6]


def first_signal_line(lines: list[str]) -> str:
    for line in lines:
        cleaned = line.strip()
        if re.search(r"(error|exception|failed|denied|not found|timed out|refused)", cleaned, flags=re.IGNORECASE):
            return cleaned
    for line in lines:
        cleaned = line.strip()
        if cleaned:
            return cleaned
    return "No non-empty error line found."


def build_handoff(category: str, evidence: list[str]) -> str:
    joined = " | ".join(evidence[:3]) if evidence else "No concise evidence extracted."
    return f"Focus on {category}. Use the evidence lines only, avoid full-log reasoning: {joined}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Compress noisy error output into a minimal, high-signal diagnostic summary.")
    parser.add_argument("--file", help="Path to a log or error file.")
    parser.add_argument("--text", help="Raw error text.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of plain text.")
    args = parser.parse_args()

    text = read_text(args.file, args.text)
    lines = text.splitlines()
    category, matched_patterns = classify(lines)
    evidence = extract_evidence(lines, matched_patterns)
    summary = {
        "category": category,
        "root_cause_guess": CAUSES[category],
        "first_signal_line": first_signal_line(lines),
        "evidence": evidence,
        "next_checks": CHECKS[category],
        "llm_handoff": build_handoff(category, evidence),
    }

    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    print(f"category: {summary['category']}")
    print(f"root_cause_guess: {summary['root_cause_guess']}")
    print(f"first_signal_line: {summary['first_signal_line']}")
    print("evidence:")
    for item in summary["evidence"]:
        print(f"- {item}")
    print("next_checks:")
    for item in summary["next_checks"]:
        print(f"- {item}")
    print(f"llm_handoff: {summary['llm_handoff']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
