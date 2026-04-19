# Superpowers 使用说明

## 已完成的安装

- 仓库已克隆到：`C:\Users\Administrator\.codex\superpowers`
- Codex 技能目录已连接到：`C:\Users\Administrator\.agents\skills\superpowers`
- 当前连接方式是 Windows junction，符合项目官方给出的 Codex 安装方式

> 注意：Codex 只会在启动时扫描 `~/.agents/skills/`，所以安装完成后需要重启一次 Codex CLI 才会生效。

## 这个项目有什么用

`superpowers` 不是一个普通的代码库模板，也不是单一命令行工具。它本质上是一套给 AI 编程代理使用的“工作流技能包”。

它的目标是把代理从“直接开始写代码”变成“先澄清需求、再写方案、再按计划开发、再做验证和 review”的工作方式。  
对 Codex 来说，它的作用主要是：

- 让代理在动手之前先做需求澄清和设计
- 把实现拆成小任务，而不是一次性乱改
- 强调 TDD、验证、代码评审和收尾流程
- 支持并行子代理执行复杂任务
- 通过技能自动触发，把这些流程变成默认行为

## 它的核心工作流

根据仓库文档，`superpowers` 的典型流程大致是：

1. `brainstorming`
   在写代码前先澄清需求、约束和方案。
2. `using-git-worktrees`
   为开发任务创建隔离工作区。
3. `writing-plans`
   把功能拆成可以逐步执行的小任务。
4. `subagent-driven-development` 或 `executing-plans`
   让子代理按任务实施，并在中间做检查。
5. `test-driven-development`
   先写失败测试，再写最小实现，再重构。
6. `requesting-code-review`
   在任务之间做代码审查。
7. `finishing-a-development-branch`
   完成后验证、整理、决定合并或保留分支。

## 主要包含哪些技能

仓库里目前能看到的关键技能包括：

- `brainstorming`
- `writing-plans`
- `executing-plans`
- `subagent-driven-development`
- `dispatching-parallel-agents`
- `test-driven-development`
- `systematic-debugging`
- `verification-before-completion`
- `requesting-code-review`
- `receiving-code-review`
- `using-git-worktrees`
- `finishing-a-development-branch`
- `using-superpowers`
- `writing-skills`

这些技能都在 `C:\Users\Administrator\.codex\superpowers\skills\` 下面，通过 `~/.agents/skills/superpowers` 被 Codex 发现。

## 在 Codex 里怎么用

### 1. 先重启 Codex

安装后必须重启当前 Codex 会话，否则新技能不会被加载。

### 2. 直接按任务描述使用

重启后，不一定要手动指定技能名。你可以直接给 Codex 任务，`superpowers` 的技能会按描述自动触发。

例如：

```text
帮我先梳理这个需求，再给出实现计划
```

```text
用 systematic-debugging 帮我定位这个 bug
```

```text
先写计划，不要直接改代码
```

```text
按 TDD 方式实现这个功能
```

```text
做一次代码 review，优先找风险和回归问题
```

### 3. 明确点名技能

如果你希望强制走某个流程，可以直接说技能名：

```text
use brainstorming
```

```text
use writing-plans
```

```text
use test-driven-development
```

## Codex 下的工作原理

在 Codex 里，`superpowers` 依赖的是原生 skill discovery 机制：

- Codex 启动时扫描 `~/.agents/skills/`
- 读取每个技能目录里的 `SKILL.md`
- 根据技能的描述和当前任务内容决定是否激活

所以它不是靠 `npm install` 或 Python 虚拟环境运行的。  
对 Codex 来说，关键是“仓库存在 + skills 目录被正确挂到 `~/.agents/skills/` + 重启生效”。

## 常用维护命令

### 更新

```powershell
cd $env:USERPROFILE\.codex\superpowers
git pull
```

更新后通常重新启动一次 Codex 更稳妥。

### 卸载

```powershell
Remove-Item "$env:USERPROFILE\.agents\skills\superpowers"
```

如果连仓库也要删掉：

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\superpowers"
```

## 可选配置

如果你想使用依赖多代理能力的技能，例如：

- `dispatching-parallel-agents`
- `subagent-driven-development`

可以在 Codex 配置里确认启用了：

```toml
[features]
multi_agent = true
```

这不是基础安装的硬性要求，但会影响部分高级技能是否能完整发挥。

## 一句话总结

`superpowers` 的价值不在于“帮你多装几个命令”，而在于给 Codex 增加一套更工程化的开发流程，让它更像一个按规范做事的工程代理，而不是直接改代码的自动补全器。
