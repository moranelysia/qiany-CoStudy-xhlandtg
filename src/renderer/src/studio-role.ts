export function readStudioRolePatch(studio: HTMLElement): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const fields = { name: 'name', nickname: 'address', catchphrase: 'catchphrase' }
  for (const [input, key] of Object.entries(fields)) {
    const el = studio.querySelector<HTMLInputElement>('[data-in="' + input + '"]')
    if (el) patch[key] = el.value.trim()
  }
  studio.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement>('[data-ce]').forEach((el) => {
    if (el.dataset.ce) patch[el.dataset.ce] = el.value.trim()
  })

  const dims: Record<string, number> = {}
  studio.querySelectorAll<HTMLElement>('[data-dim]').forEach((row) => {
    const slider = row.querySelector<HTMLInputElement>('[data-slider]')
    if (row.dataset.dim && slider) dims[row.dataset.dim] = Number(slider.value)
  })
  patch.dims = dims

  const choices = { stage: 'stage', exercise: 'exercise', error: 'errorMode' }
  for (const [group, key] of Object.entries(choices)) {
    const selected = studio.querySelector<HTMLElement>(
      '[data-segmented="' + group + '"] [aria-checked="true"]',
    )
    if (selected?.dataset.value) patch[key] = selected.dataset.value
  }
  return patch
}
