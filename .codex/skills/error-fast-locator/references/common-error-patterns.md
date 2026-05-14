# Common Error Patterns

Use this file only when the failure is ambiguous and the script output is not enough.

## Network Family

Typical signals:
- `Connection refused`
- `Connection reset`
- `socket hang up`
- `TLS`, `SSL`, `certificate`

Check order:
1. Confirm host and port.
2. Confirm the target service is up.
3. Confirm proxy, VPN, firewall, and certificate assumptions.

## DNS

Typical signals:
- `getaddrinfo`
- `ENOTFOUND`
- `Name or service not known`
- `Temporary failure in name resolution`

Check order:
1. Confirm the hostname is correct.
2. Confirm current network environment can resolve it.
3. Confirm proxy or VPN expectations.

## File And Path

Typical signals:
- `No such file or directory`
- `FileNotFoundError`
- `The system cannot find the path specified`
- `invalid path`

Check order:
1. Print the current working directory.
2. Resolve the path to an absolute path.
3. Confirm whether the artifact should already exist or must be generated first.

## Permission

Typical signals:
- `Permission denied`
- `EACCES`
- `EPERM`
- `Access is denied`

Check order:
1. Confirm the current process user.
2. Confirm file or directory ownership and mode.
3. Confirm whether elevation is actually required.

## Command Or Module Missing

Typical signals:
- `command not found`
- `is not recognized as an internal or external command`
- `ModuleNotFoundError`
- `Cannot find module`

Check order:
1. Confirm the executable or package name.
2. Confirm PATH, interpreter, virtualenv, or package manager context.
3. Confirm the command runs in the same environment where the dependency was installed.

## Compression Rule

Never send a full noisy log to the LLM if one error line already localizes the class of failure. Send:
- 1 category
- 1 root-cause guess
- up to 6 evidence lines
- up to 3 next checks
