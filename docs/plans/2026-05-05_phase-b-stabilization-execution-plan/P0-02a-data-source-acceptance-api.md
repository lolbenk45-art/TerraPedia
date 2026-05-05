# P0-02a Data Source Acceptance Failure Samples API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add report-derived failure samples to `GET /admin/data-source-acceptance/overview` without real-time DB gate queries.

**Architecture:** Extend the existing overview DTO and service projection. Samples come only from parsed report JSON fields already read by `DataSourceAcceptanceServiceImpl`; they never execute report generator commands and never query DB as gate evidence.

**Tech Stack:** Spring Boot, Java DTO/service tests, existing `reports/**.json` evidence files.

---

## Files

- Modify: `back/src/main/java/com/terraria/skills/dto/DataSourceAcceptanceOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminDataSourceAcceptanceControllerTest.java`

## Steps

- [ ] **Step 1: Add failing service test**

Add a test case that writes a temporary report containing:

```json
{
  "generatedAt": "2026-05-05T00:00:00Z",
  "summary": { "blockingCount": 1, "warningCount": 1 },
  "checks": [
    { "id": "orphan-source", "status": "blocked", "message": "source row has no entity", "reportPath": "reports/relation/source-orphans.json" },
    { "id": "stale-warning", "status": "warning", "message": "sample stale relation", "reportPath": "reports/relation/stale-warning.json" }
  ],
  "blockingReasons": ["source row has no entity"],
  "warningReasons": ["sample stale relation"]
}
```

Required assertions:

```java
assertFalse(panel.getFailureSamples().isEmpty());
assertEquals("report-check", panel.getFailureSamples().get(0).getSampleSource());
assertEquals(Boolean.FALSE, panel.getFailureSamples().get(0).getNotGateEvidence());
assertNotNull(panel.getFailureSamples().get(0).getFreshnessStatus());
```

- [ ] **Step 2: Add failing controller contract test**

Add JSON assertions:

```java
.andExpect(jsonPath("$.data.relationHealth.failureSamples[0].status").value("blocked"))
.andExpect(jsonPath("$.data.relationHealth.failureSamples[0].sampleSource").value("report-check"))
.andExpect(jsonPath("$.data.relationHealth.failureSamples[0].notGateEvidence").value(false))
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
cd back
mvn "-Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest" test
```

Expected: FAIL because DTO/service do not expose `failureSamples`.

- [ ] **Step 4: Add DTO fields**

Add to `AcceptancePanelDTO`:

```java
private List<AcceptanceFailureSampleDTO> failureSamples = new ArrayList<>();
```

Add nested DTO:

```java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public static class AcceptanceFailureSampleDTO {
    private String entityType;
    private String entityId;
    private String sourceId;
    private String status;
    private String reason;
    private String evidencePath;
    private String recommendedAction;
    private String freshnessStatus;
    private String reportPath;
    private String sampleSource;
    private Boolean notGateEvidence;
}
```

- [ ] **Step 5: Implement report-only extraction**

In `DataSourceAcceptanceServiceImpl`, after report parsing and freshness application, fill samples from:

- Parsed `panel.getChecks()`.
- Root `checks[]`.
- Root `blockingReasons[]`.
- Root `warningReasons[]`.

Rules:

- Limit to 50 samples per panel.
- Use `sampleSource="report-check"` for check-derived samples.
- Use `sampleSource="report-reason"` for reason-derived samples.
- Use `notGateEvidence=false`.
- Set `recommendedAction` to `panel.getNextEvidenceCommand()` when present, else `panel.getGeneratorCommand()`.
- Do not query DB.
- Do not execute `generatorCommand`.

Sample mapping:

```text
entityType = panel.id
entityId = check.id or null
sourceId = null
status = check.status or "blocked"/"warning"
reason = check.message or reason text
evidencePath = check.reportPath
freshnessStatus = panel.freshnessStatus
reportPath = panel.reportPath
```

- [ ] **Step 6: Validate backend**

Run:

```powershell
cd back
mvn "-Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest" test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add back/src/main/java/com/terraria/skills/dto/DataSourceAcceptanceOverviewDTO.java back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java back/src/test/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImplTest.java back/src/test/java/com/terraria/skills/controller/AdminDataSourceAcceptanceControllerTest.java
git commit -m "feat: add data source acceptance failure samples api"
```
