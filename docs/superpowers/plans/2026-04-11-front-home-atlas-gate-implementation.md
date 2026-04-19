# Front Home Atlas Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved `Atlas Gate` homepage design in `front` without changing backend contracts or removing the existing homepage information architecture.

**Architecture:** Keep the current Vue public front shell and data-fetching flow, but align the homepage, navbar, footer, and shared visual tokens to the approved `Moss Lantern` system. Drive the work with failing Vitest coverage for shell branding and homepage structure, then make the minimal component and CSS updates required to satisfy the design.

**Tech Stack:** Vue 3, Vue Router, TypeScript, Vitest, Vite, CSS

---

### Task 1: Lock the desired shell and homepage behavior with tests

**Files:**
- Modify: `front/src/tests/npc-public-shell.spec.ts`
- Create: `front/src/tests/home-atlas-gate.spec.ts`
- Test: `front/src/tests/npc-public-shell.spec.ts`
- Test: `front/src/tests/home-atlas-gate.spec.ts`

- [ ] **Step 1: Write the failing shell-branding test**

```ts
it('shows the atlas brand language in the shared navbar shell', async () => {
  const wrapper = mount(Navbar, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  })

  expect(wrapper.text()).toContain('Adventure Atlas')
  expect(wrapper.text()).not.toContain('Terraria Field Guide')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front vitest run src/tests/npc-public-shell.spec.ts`
Expected: `FAIL` because the current navbar still renders the old subtitle.

- [ ] **Step 3: Write the failing homepage structure test**

```ts
it('renders the atlas gate hero, route scene, and category routes from fetched data', async () => {
  const wrapper = mount(HomePage, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()

  expect(wrapper.text()).toContain('Adventure Atlas')
  expect(wrapper.text()).toContain('Atlas Gate')
  expect(wrapper.text()).toContain('Continue by category instead of scrolling through noise.')
  expect(wrapper.findAll('.atlas-category')).toHaveLength(4)
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --dir front vitest run src/tests/home-atlas-gate.spec.ts`
Expected: `FAIL` because the current implementation does not yet satisfy the new assertions.

### Task 2: Implement the Atlas Gate shell and homepage

**Files:**
- Modify: `front/src/components/Navbar.vue`
- Modify: `front/src/components/AppFooter.vue`
- Modify: `front/src/views/HomePage.vue`
- Modify: `front/src/assets/main.css`

- [ ] **Step 1: Update the navbar shell to the approved atlas brand language**

```vue
<small>Adventure Atlas</small>
```

- [ ] **Step 2: Strengthen the homepage hero, scene framing, and route cards**

```vue
<div class="atlas-stage__sky" aria-hidden="true"></div>
<div class="atlas-stage__artifacts" aria-hidden="true">
  <span class="atlas-artifact atlas-artifact--one"></span>
  <span class="atlas-artifact atlas-artifact--two"></span>
</div>
```

- [ ] **Step 3: Align footer copy and shared tokens with the same Atlas Gate system**

```vue
<span>Adventure Atlas</span>
<span>Public front-end</span>
```

- [ ] **Step 4: Run focused tests to verify the implementation passes**

Run: `pnpm --dir front vitest run src/tests/npc-public-shell.spec.ts src/tests/home-atlas-gate.spec.ts`
Expected: `PASS`

### Task 3: Validate the front build stays healthy

**Files:**
- Modify: `front/src/tests/home-atlas-gate.spec.ts`
- Modify: `front/src/views/HomePage.vue`
- Modify: `front/src/components/Navbar.vue`
- Modify: `front/src/components/AppFooter.vue`
- Modify: `front/src/assets/main.css`

- [ ] **Step 1: Run type-check and production build validation**

Run: `pnpm --dir front build`
Expected: `vue-tsc` succeeds and Vite emits a production bundle.

- [ ] **Step 2: Review the changed scope before wrapping**

Run: `git status --short`
Expected: only the intended `front` files and plan/test additions are relevant to this task.
