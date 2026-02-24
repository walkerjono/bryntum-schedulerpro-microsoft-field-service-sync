## Plan: Fix Histogram Bar Proportional Scaling

**TL;DR:** Two bugs cause incorrect histogram bar heights and broken overallocation styling. First, `getBarClass` uses the wrong function signature — it destructures the `series` parameter instead of using the `datum` (3rd arg), so overallocation detection never works. Second, and more impactful for bar heights: the ResourceHistogram auto-generates scale points from the time axis tick size and calendar, which should work — but the `scaleColumn` override may be interfering. The fix is to correct `getBarClass` to the proper 5-parameter signature and let the built-in scale column handle scaling naturally.

**Steps**

1. **Fix `getBarClass` in [histogramConfig.js](src/histogramConfig.js#L16-L21)**: The current function uses `({ value, maxValue })`, destructuring the **first** parameter (`series: HistogramSeries`), which has no `value` or `maxValue` properties. Both are always `undefined`, so the function always returns `'b-underallocated'`. The correct signature per the [type definitions](node_modules/@bryntum/schedulerpro/schedulerpro.d.ts#L326301) is:
   ```
   getBarClass(series, domConfig, datum, index, renderData)
   ```
   The allocation data lives on the 3rd parameter `datum` (`ResourceAllocationInterval`), which has `isOverallocated`, `isUnderallocated`, `effort`, and `maxEffort` properties. Change the function to check `datum.isOverallocated`.

2. **Remove explicit `scaleColumn` config from [histogramConfig.js](src/histogramConfig.js#L31-L33)**: The `ResourceHistogram` automatically adds a scale column and auto-generates scale points based on the time axis tick size and the resource's calendar. With `weekAndMonth` preset, each tick = 1 week, and with the `business` calendar (Mon-Fri 8h/day), the scale should auto-derive a top value of 40h/week. The explicit `scaleColumn: { hidden: false }` override may be interfering with the auto-generated configuration. Remove it to let the defaults work.

3. **If auto-scaling still doesn't produce correct proportions**, add a `generateScalePoints` listener to force calendar-aware scale points. This would replace auto-generated "7 calendar days" scale with actual working-hours scale. Note: the `generateScalePoints` event fires globally (not per-row), so resources with non-standard `workingHours` would need per-row handling via `beforeRenderHistogramRow` instead.

4. **Optionally set `showBarText: true`** to display effort text on bars, which makes it easier to verify values are correct during testing.

**Verification**
- After changes, check a resource with ~23.5h allocated in a week: the bar should appear ~59% full (23.5/40), not ~100%.
- Check an overallocated resource: bars should render with the red `b-overallocated` CSS class.
- Open browser dev tools → inspect an SVG `rect.b-series-effort` element → check the `dataset.topValue` attribute on the parent SVG to confirm it matches the expected weekly capacity (~144,000,000ms = 40h).
- Test with the "Effort Remaining" toggle to confirm the switch works correctly.

**Decisions**
- Fix `getBarClass` signature: use `datum.isOverallocated` boolean from the engine (reliable) rather than manual `effort > maxEffort` comparison.
- Start with default `scaleColumn` behavior (step 2) before adding `generateScalePoints` customization (step 3), to minimize unnecessary overrides.
