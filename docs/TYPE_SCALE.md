# Type scale

Reed uses one small set of text sizes on each platform. Use the tokens, not literal sizes.

| Role | Desktop (CSS) | Android (`ReedType`) |
| --- | --- | --- |
| Badges, rail labels, fixed-space metadata (the floor) | `--type-micro` 11px | `micro` 11sp |
| Uppercase section labels, tags, monospace IDs | `--type-small` 12px | `label` 12sp |
| Helper and supporting text | `--type-body` 13px | `caption` 13sp |
| Dense body: lists, node text, controls | `--type-body-lg` 14px | `body` 14sp |
| Comfortable body | 15–16px | `bodyLarge` 15sp, Material body 16sp |
| Titles | 17–24px | `title` 18sp, Material headlines |

Nothing goes below 11px/11sp. Android sizes run one step larger than desktop because the DC-1 is a reflective display read at arm's length. Hierarchy comes from size steps plus weight, case, and color, not from shrinking text.
