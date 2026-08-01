# Workflow ambiguity corpus report

> Scope: P0-A routing contract for weak request wording.
>
> Verification receipt: `receipt:5f6408b9-1f0c-4fef-b30f-114646af9559`
>
> Test: `node --test rex-harness/tests/application/ambiguity-routing.test.mjs`
>
> Result: **31/31 passed** (30 routing cases plus coverage/uniqueness contract).

## Routing rule

Weak wording may add `acceptance-criteria-missing`, but only the narrow vague-action patterns are treated this way. A specific behavior request still enters `software.testing.design`; a structured failure, path, dependency, or new-construct Observation keeps its higher-priority route. A typed Requirements Decision suppresses weak reclassification of the raw request.

## Cases

| ID | Locale | Input | Expected capability | Expected reason |
|---|---|---|---|---|
| cn-vague-login-01 | zh-CN | 把用户登录改一下 | software.requirements.clarify | acceptance-criteria-missing |
| cn-vague-checkout-02 | zh-CN | 把支付流程优化一下 | software.requirements.clarify | acceptance-criteria-missing |
| cn-vague-order-03 | zh-CN | 处理一下订单逻辑 | software.requirements.clarify | acceptance-criteria-missing |
| cn-vague-permission-04 | zh-CN | 完善一下权限逻辑 | software.requirements.clarify | acceptance-criteria-missing |
| en-vague-login-05 | en | Tweak the login logic. | software.requirements.clarify | acceptance-criteria-missing |
| en-vague-pronoun-06 | en | Change it. | software.requirements.clarify | acceptance-criteria-missing |
| en-vague-auth-07 | en | Fix the auth logic. | software.requirements.clarify | acceptance-criteria-missing |
| en-explicit-criteria-08 | en | Clarify the domain vocabulary before implementation. | software.requirements.clarify | acceptance-criteria-missing |
| en-unclear-requirements-09 | en | We have unclear requirements for checkout. | software.requirements.clarify | acceptance-criteria-missing |
| cn-acceptance-10 | zh-CN | 补充验收标准后再做结账功能 | software.requirements.clarify | acceptance-criteria-missing |
| cn-ambiguous-11 | zh-CN | 需求有歧义，先澄清 | software.requirements.clarify | acceptance-criteria-missing |
| en-criteria-12 | en | Update the behavior but acceptance criteria are unclear. | software.requirements.clarify | acceptance-criteria-missing |
| cn-vague-session-13 | zh-CN | 把会话逻辑改一改，具体结果还没定 | software.requirements.clarify | acceptance-criteria-missing |
| en-vague-core-14 | en | Change the core logic. | software.requirements.clarify | acceptance-criteria-missing |
| en-vague-something-15 | en | Improve something in the checkout flow. | software.requirements.clarify | acceptance-criteria-missing |
| en-specific-auth-16 | en | Update authentication behavior. | software.testing.design | behavior-change |
| en-specific-validation-17 | en | Update the public input validation behavior. | software.testing.design | behavior-change |
| en-minimal-existing-18 | en | Implement the smallest change for an existing validation rule. | software.testing.design | behavior-change |
| en-failure-19 | en | The command failed while running the checkout test. | software.debug.root-cause | execution-failed |
| cn-structured-failure-20 | zh-CN | 继续当前实现。 + execution.failure-observed | software.debug.root-cause | execution-failed |
| cn-unknown-path-21 | zh-CN | 梳理未知迁移路径，再决定下一步。 | software.navigation.wayfind | path-unknown |
| en-unknown-path-22 | en | Map the unknown execution path before coding. | software.navigation.wayfind | path-unknown |
| cn-dependent-23 | zh-CN | 先更新 schema 再执行迁移，最后验证导出。 | software.planning.sequence | dependent-work-items |
| en-dependent-24 | en | First update the schema, then migrate data, finally verify the export. | software.planning.sequence | dependent-work-items |
| en-new-construct-25 | en | Create a new payment module. | software.implementation.minimize | new-construct-proposed |
| cn-new-construct-26 | zh-CN | 新增一个 TypeScript helper。 | software.implementation.minimize | new-construct-proposed |
| en-read-only-27 | en | Explain the login logic without changing code. | none | none |
| en-read-only-28 | en | Review the current diff and explain the regression. | none | none |
| en-structured-risk-29 | en | Update authentication behavior. + high-risk Observation | software.testing.design | behavior-change |
| decision-override-30 | zh-CN | 把用户登录改一下 + typed decision | software.testing.design | behavior-change |

## Files

- Fixture: `rex-harness/tests/fixtures/ambiguity-corpus.mjs`
- Contract test: `rex-harness/tests/application/ambiguity-routing.test.mjs`
- Runtime rule: `rex-harness/src/application/derive-facts.mjs`

## Known boundary

This corpus deliberately does not implement the new P1 intent vocabulary (`grill`, `spec`, `tickets`, `review`, `implement`, `debug`). Those values belong to the explicit-intent allowlist slice and must receive a separate route matrix; the corpus only verifies current intent values and structured observations do not regress the P0 ambiguity contract.
