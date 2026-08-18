# Chart Distance Axis and Redux DevTools Design

## Goal

Correct the chart x-axis so uPlot treats its values as distance in metres rather
than Unix timestamps, and expose the application store through Redux DevTools
with useful action names.

## Chart Scale

Every chart receives the same one-metre distance grid as its x series. The
shared chart options must therefore declare the `x` scale as non-temporal with
`time: false`. The x-axis is labelled `Distance (m)` so its meaning and unit are
explicit. Delta and channel charts inherit both settings from the common base
options, preserving their existing cursor synchronization and zoom behavior.

The options tests will assert the non-temporal scale and axis label. This
prevents a regression to uPlot's default temporal scale, which rendered small
distance values as dates beginning at the Unix epoch.

## Redux DevTools

The existing zustand vanilla state creator will be wrapped in zustand's
`devtools` middleware. The connection is named `LapLedger`, and each state
transition supplies a stable action type matching the public operation that
caused it, such as `session/add`, `lap/setReference`, and `cursor/set`.

The exported `appStore` and `AppState` API remain unchanged. In browsers without
the Redux DevTools extension, zustand's middleware remains inactive and the
store continues to work normally. A test will provide a fake extension API and
verify the named connection and action messages; the existing store tests will
continue to cover state behavior.

## Scope

This correction does not introduce a time-basis chart mode, persist state, or
change chart data. It only makes the configured scale agree with the existing
distance data and adds development-time state inspection.
