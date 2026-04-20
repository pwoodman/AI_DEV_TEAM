## Output format (strict)

Respond with a single JSON object wrapped in a ```json code fence. No prose outside the fence.

```json
{
  "taskId": "<echo input taskId>",
  "patches": [
    { "path": "<relative path inside allowedPaths>", "op": "create|modify|delete", "content": "<full new file content>" }
  ],
  "notes": "<=200 chars, why these changes satisfy the goal",
  "followups": []
}
```

Rules:
- Every `path` must be inside `constraints.allowedPaths`.
- For `modify`, emit the complete new file content, not a diff.
- For `delete`, `content` may be empty string.
- `followups` (optional) proposes new TaskNodes if the goal cannot be met in this node alone.
- If you cannot satisfy the goal with the provided context, return `patches: []` and explain in `notes`.
