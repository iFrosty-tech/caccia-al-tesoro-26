export const meta = {
  name: 'team-sottosopra',
  description: 'Sottosopra design team: regia writes the brief, specialists build, two reviewers check, rifinitura applies the fixes',
  whenToUse: 'Visual, UX or effects work on the Caccia al Tesoro site that spans several areas (background, UI, motion, assets, loader). Pass the request as args (a string).',
  phases: [
    { title: 'Regia', detail: 'brief in odd/tasks and assignments' },
    { title: 'Costruzione', detail: 'specialists in parallel; motion after componenti' },
    { title: 'Revisione', detail: 'critica and accessibilita, independent' },
    { title: 'Rifinitura', detail: 'confirmed fixes, full harness, evidence in the brief' },
  ],
}

// The agents are defined in .claude/agents/ (team, rules and ownership: odd/team-sottosopra.md).
// Nobody commits: the session that ran the workflow reviews the diff and commits it.

const REQUEST = String((args && args.request) || args || '').trim()
if (!REQUEST) {
  throw new Error('Pass the request as args, e.g. "ridisegna la pagina dell\'enigma finale"')
}

const BUILDERS = ['atmosfera', 'identita', 'varco', 'componenti', 'motion']

const PLAN = {
  type: 'object',
  properties: {
    brief_path: { type: 'string', description: 'Path of the brief written in odd/tasks/' },
    summary: { type: 'string' },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: BUILDERS },
          task: { type: 'string', description: 'Concrete task: files, what to build, what done looks like' },
        },
        required: ['role', 'task'],
      },
    },
  },
  required: ['brief_path', 'summary', 'assignments'],
}

const BUILD_REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What you built and how it looks/behaves' },
    files_changed: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    verification: { type: 'string', description: 'Commands run, screenshot paths, results' },
    open_issues: { type: 'array', items: { type: 'string' } },
    notes_for_team: { type: 'string', description: 'Class names, APIs, hooks the others must know' },
  },
  required: ['summary', 'files_changed', 'decisions', 'verification', 'open_issues', 'notes_for_team'],
}

const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          area: { type: 'string' },
          file: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'area', 'problem', 'evidence', 'fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const FIX_REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    fixed: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' }, description: 'Each with the reason' },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification: { type: 'string' },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'fixed', 'skipped', 'files_changed', 'verification', 'open_issues'],
}

// ---------- Regia ----------
phase('Regia')
const plan = await agent(
  `The organizer's request (Italian):\n\n${REQUEST}\n\n` +
    'Write the brief for it and assign the work to the builders it needs. Return the plan.',
  { label: 'regia', phase: 'Regia', agentType: 'regia', schema: PLAN }
)
if (!plan || !plan.assignments || !plan.assignments.length) {
  return { plan, note: 'regia assigned no work' }
}

const tasks = {}
for (const a of plan.assignments) {
  if (!BUILDERS.includes(a.role)) continue
  tasks[a.role] = tasks[a.role] ? tasks[a.role] + '\n\n' + a.task : a.task
}
log(`Brief: ${plan.brief_path}. Builders: ${Object.keys(tasks).join(', ')}.`)

const buildPrompt = (task, extra) =>
  `The organizer's request (Italian):\n\n${REQUEST}\n\n` +
  `Brief: ${plan.brief_path} (read it fully first).\n\nYour task:\n${task}` +
  (extra || '') +
  '\n\nOther members may be editing their own files in the same working tree right now. ' +
  'Return your build report.'

// ---------- Costruzione ----------
phase('Costruzione')
const independent = Object.keys(tasks).filter((r) => r !== 'componenti' && r !== 'motion')
const sideTeam = parallel(
  independent.map((role) => () =>
    agent(buildPrompt(tasks[role]), { label: role, phase: 'Costruzione', agentType: role, schema: BUILD_REPORT })
  )
)
// motion animates on top of componenti's static end states, so it starts after it.
const uiChain = (async () => {
  const out = {}
  if (tasks.componenti) {
    out.componenti = await agent(buildPrompt(tasks.componenti), {
      label: 'componenti', phase: 'Costruzione', agentType: 'componenti', schema: BUILD_REPORT,
    })
  }
  if (tasks.motion) {
    const extra = out.componenti ? `\n\ncomponenti has just finished. Its report:\n${JSON.stringify(out.componenti, null, 2)}` : ''
    out.motion = await agent(buildPrompt(tasks.motion, extra), {
      label: 'motion', phase: 'Costruzione', agentType: 'motion', schema: BUILD_REPORT,
    })
  }
  return out
})()

const [side, ui] = await Promise.all([sideTeam, uiChain])
const reports = Object.assign({}, ui)
independent.forEach((role, i) => { reports[role] = side[i] })

// ---------- Revisione ----------
phase('Revisione')
const reviewPrompt =
  `The organizer's request (Italian):\n\n${REQUEST}\n\nBrief: ${plan.brief_path}.\n\n` +
  `The builders have finished. Their reports:\n${JSON.stringify(reports, null, 2)}\n\n` +
  'Review the result and return your findings.'
const [critica, accessibilita] = await parallel([
  () => agent(reviewPrompt, { label: 'critica', phase: 'Revisione', agentType: 'critica', schema: FINDINGS }),
  () => agent(reviewPrompt, { label: 'accessibilita', phase: 'Revisione', agentType: 'accessibilita', schema: FINDINGS }),
])
const reviews = { critica, accessibilita }
const actionable = [critica, accessibilita]
  .filter(Boolean)
  .flatMap((r) => r.findings || [])
  .filter((f) => f.severity !== 'P3')
log(`Reviews: ${actionable.length} findings P0-P2.`)

// ---------- Rifinitura ----------
phase('Rifinitura')
const rifinitura = await agent(
  `The organizer's request (Italian):\n\n${REQUEST}\n\nBrief: ${plan.brief_path}.\n\n` +
    `Build reports:\n${JSON.stringify(reports, null, 2)}\n\n` +
    `Reviews:\n${JSON.stringify(reviews, null, 2)}\n\n` +
    'Verify and apply the confirmed findings, re-run the full harness, update the brief. Return your report.',
  { label: 'rifinitura', phase: 'Rifinitura', agentType: 'rifinitura', schema: FIX_REPORT }
)

return { plan, reports, reviews, rifinitura }
