# Task Layout

Create task folders only in `<project-root>/task/`.

## Folder Name

Format:

`YYYY-MM-DD_<normalized-task-name>`

Normalization rules:

- remove `< > : " / \ | ? *`
- trim leading and trailing whitespace
- replace internal whitespace runs with `-`
- preserve Chinese characters, letters, and digits

Collision rules:

- same task continuation: reuse the existing folder
- different task with same normalized name on the same day: append `-02`, `-03`, and so on

## Required Structure

Every `git + task` task folder must contain:

```text
<task-folder>/
├── README.md
├── docs/
│   ├── README.md
│   └── summary.md
├── data/
│   └── README.md
├── artifacts/
│   └── README.md
└── logs/
    └── README.md
```

## Directory Meaning

- `README.md`: stable task overview, status, and navigation
- `docs/`: human-facing notes and compact summaries
- `data/`: structured machine-readable outputs
- `artifacts/`: screenshots, HTML exports, and non-code attachments
- `logs/`: long runtime or validation output

Keep the first version shallow. Only create deeper subfolders when the task clearly benefits from them.
