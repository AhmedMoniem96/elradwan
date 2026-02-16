# UI Consistency Checklist

Use this checklist for page-level implementation (applied to Dashboard, Reports, Inventory):

- [ ] **Component spacing:** Use theme tokens (`customSpacing.pageX/pageY/sectionGap/panelPadding`) and avoid hard-coded margins.
- [ ] **Font sizes:** Use semantic typography (`pageTitle`, `sectionTitle`, body/caption variants) for headings and supporting text.
- [ ] **Button hierarchy:** Primary actions use `contained`, secondary actions use `outlined`, tertiary actions use `text`.
- [ ] **Cards & panels:** Prefer `Card variant="panel"` or `SectionPanel` to keep border radius, border, and elevation consistent.
- [ ] **Data density:** Keep tables on compact density (`size="small"` via theme defaults), with readable header contrast.
- [ ] **Dark-mode contrast:** Validate chart labels, card borders, and status chips against dark backgrounds.
