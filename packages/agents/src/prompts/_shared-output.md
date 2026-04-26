## Output format

```json
{"taskId":"<echo>","patches":[{"path":"<path inside allowedPaths>","op":"create|modify|delete","content":"<full file content>"}],"notes":"<≤50 chars>","followups":[]}
```

- `modify` → full new file content, not a diff.
- `patches:[]` + explain in `notes` if goal cannot be met.
