/**
 * Ambient Bryntum type augmentations.
 *
 * Bryntum's published types for SchedulerPro.widgetMap are `Record<string, Widget>`.
 * We declare the specific widget keys used in our toolbar so code can access them
 * without casts or `any`.
 */

import type { Widget } from '@bryntum/schedulerpro';

/** A combo-style widget (Bryntum Combo). */
interface BryntumCombo extends Widget {
    value: string[] | null;
    items: Array<{ value: string; text: string }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
}

/** A toggle/checkbox widget. */
interface BryntumToggle extends Widget {
    checked: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
}

/** A button widget. */
interface BryntumButton extends Widget {
    disabled: boolean;
    icon: string;
    pressed?: boolean;
    dataset?: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
}

/** A button group widget. */
interface BryntumButtonGroup extends Widget {
    items: BryntumButton[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
}

/** Known widget keys in our SchedulerPro toolbar. */
export interface AppWidgetMap {
    practiceFilter?: BryntumCombo;
    roleFilter?: BryntumCombo;
    resourceFilter?: BryntumCombo;
    effortToggle?: BryntumToggle;
    refreshButton?: BryntumButton;
    zoomInButton?: BryntumButton;
    zoomOutButton?: BryntumButton;
    viewPresetGroup?: BryntumButtonGroup;
}
