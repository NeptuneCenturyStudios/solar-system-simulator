export function escapeHtml(s) {
    // NOTE: Required because we build the bodies table via `innerHTML`.
    // Always escape user-provided strings (names can be edited/auto-generated).
    // Produce proper HTML entities so the string is safe to insert into HTML.
    //
    // Workaround: this repo's formatter/linter appears to "helpfully" unescape literal `&` etc
    // when written directly. Build the entity strings dynamically to keep the intended values.
    const amp = '&' + 'amp;'
    const lt = '&' + 'lt;'
    const gt = '&' + 'gt;'
    const quot = '&' + 'quot;'
    const apos = '&#39;'

    return String(s)
        .replaceAll('&', amp)
        .replaceAll('<', lt)
        .replaceAll('>', gt)
        .replaceAll('"', quot)
        .replaceAll("'", apos)
}
