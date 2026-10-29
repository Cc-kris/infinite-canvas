# R13 维度矩阵重算（HAND_REPAIR F 收口）

- 生成：`tools/recompute_scope_matrix_r8.py`（严格口径：证据须在 HEAD 中被跟踪）
- 变更点：为 HAND_REPAIR 补入真实回执 `evidence/real-acceptance/HAND_REPAIR/r13-three-actions-real.json`（真实 task `task-mvtbe5rp-0maafh`，2153466B / sha256 a34cea71…，下载落盘·存资产 `image:IAOrghYuVoJCEN-EQwcJb`·发画布 `image:88r6ZLKnLPxyB8hci62eW` 三处一致，无新生成、无状态注入）
- F 计数：PASS 31 / PARTIAL 8（HAND_REPAIR 由 PARTIAL → PASS）
- H 计数：PASS 11 / PARTIAL 28（HAND_REPAIR 仍 PARTIAL：脚本要求 reload 快照恢复回执）
- 验证：`tsc --noEmit` 0 错误；历史坞/结果动作/registry 测试 34 pass / 0 fail
