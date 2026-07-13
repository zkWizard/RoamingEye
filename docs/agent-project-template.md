# RoamingEye Catalog Operations project

Use a GitHub Project as the human operating board for the software-catalog
fleet. The in-app **Fleet status** view reports what the agents did; this
Project tracks the decisions, owners, and follow-up that require judgement.

## Create the project

1. In GitHub, create a table project named **RoamingEye Catalog Operations**.
2. Add the fields below and save the two views described here.
3. Create one draft item for each `catalog/review-queue.json` record that
   needs editorial work. Link the item to an issue when a discussion, a
   contributor, or a pull request is involved.

## Fields

| Field            | Type          | Values / purpose                                                                              |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------- |
| **Stage**        | Single select | `Inbox`, `Needs evidence`, `Ready for review`, `Approved`, `Published`, `Deferred`            |
| **Source agent** | Single select | `Scout`, `Verifier`, `Workflow Mapper`, `Access Editor`, `Experience Builder`, `QA / Release` |
| **Verification** | Single select | `Unverified`, `Verified`, `Unavailable`, `Needs licence evidence`                             |
| **Priority**     | Single select | `High`, `Normal`, `Low`                                                                       |
| **Repository**   | Text          | Canonical `owner/repository` identifier                                                       |
| **Last checked** | Date          | Date from the verifier record                                                                 |
| **Owner**        | Assignees     | Editorial decision-maker                                                                      |

## Views

### Editorial queue

- Filter: `Stage` is not `Published` and is not `Deferred`.
- Group by: `Stage`.
- Show: title, repository, verification, source agent, last checked, owner,
  and priority.
- Sort: priority descending, then last checked ascending.

This is the working view for reviewing a discovery, finding primary sources,
and assigning any follow-up.

### Release health

- Filter: `Stage` is `Approved` or `Published`.
- Group by: `Verification`.
- Show: repository, stage, last checked, owner, and source agent.
- Sort: last checked ascending.

Use this before merging the agent fleet's draft pull request. A tool should not
be published unless its GitHub SPDX evidence, documentation link, access
metadata, and human approval all agree.

## Operating loop

| Fleet handoff                             | Project action                                                  |
| ----------------------------------------- | --------------------------------------------------------------- |
| Scout discovers a project                 | Add an `Inbox` item with Source agent `Scout`.                  |
| Verifier cannot establish evidence        | Move to `Needs evidence` and set the verification state.        |
| Verifier succeeds                         | Move to `Ready for review`; assign an editor.                   |
| Editor approves `catalog/candidates.json` | Move to `Approved`.                                             |
| Draft PR passes QA and is merged          | Move to `Published`; record the release or PR link in the item. |
| Project is out of scope                   | Move to `Deferred` with a short rationale.                      |

The weekly workflow may create a draft PR containing changed catalog artifacts.
Review the `review-queue.json` link in Fleet status, update this Project, then
approve only the candidates that should reach the public finder. This keeps the
agents useful without granting them editorial authority.
