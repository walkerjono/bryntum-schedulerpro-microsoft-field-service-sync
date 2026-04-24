/**
 * Timesheet Variation Dialog.
 *
 * A Bryntum Popup that displays variation / remaining details for a
 * standard time-entry row.  Fields:
 *  - Hours (NumberField)
 *  - Reason (Combo — loaded lazily from D365)
 *  - End date (DateField)
 *  - Comment (TextAreaField)
 *
 * Actions: Save · Delete · Cancel.
 *
 * The dialog mutates the Bryntum Grid record directly so the change
 * is captured by the existing diffPivotRows save pipeline.
 */

import { Popup, NumberField, Combo, DateField, TextAreaField, Button, Widget } from '@bryntum/schedulerpro';
import { getVariationReasons } from './timesheetDataService';
import { getTimesheetSettings } from './timesheetSettings';
import type { D365VariationReason } from '../types/timesheet';
import type TimesheetRowModel from '../lib/TimesheetRowModel';

// ── Cached reason data ──────────────────────────────────────────────

let reasonsCache : D365VariationReason[] | null = null;
let reasonsLoading = false;

/**
 * Lazy-load variation reasons with caching.
 */
async function loadReasons() : Promise<D365VariationReason[]> {
    if (reasonsCache) return reasonsCache;
    if (reasonsLoading) {
        // Wait for in-flight request (simple polling)
        return new Promise((resolve) => {
            const poll = setInterval(() => {
                if (reasonsCache) {
                    clearInterval(poll);
                    resolve(reasonsCache);
                }
            }, 100);
        });
    }

    reasonsLoading = true;
    try {
        reasonsCache = await getVariationReasons();
        return reasonsCache;
    }
    finally {
        reasonsLoading = false;
    }
}

/**
 * Reset the reason cache (e.g. on view destroy).
 */
export function resetVariationReasonCache() : void {
    reasonsCache = null;
}

// ── Dialog state ────────────────────────────────────────────────────

let popup : Popup | null = null;
let activeRecord : TimesheetRowModel | null = null;
let onSaveCallback : (() => void) | null = null;

// ── Public API ──────────────────────────────────────────────────────

export interface VariationDialogOptions {
    /** The grid record to edit. */
    record : TimesheetRowModel;
    /** Called after save or delete so the view can recalculate totals. */
    onSave? : () => void;
    /** Anchor element for positioning (optional). */
    anchor? : HTMLElement;
}

/**
 * Open the variation dialog for a given row record.
 */
export async function openVariationDialog(options : VariationDialogOptions) : Promise<void> {
    activeRecord = options.record;
    onSaveCallback = options.onSave ?? null;

    // Pre-load reasons
    const reasons = await loadReasons();

    // Destroy previous popup if lingering
    if (popup) {
        popup.destroy();
        popup = null;
    }

    const currentHours     = (activeRecord.get('variationTime') as number) ?? 0;
    const currentComment   = (activeRecord.get('variationComment') as string) ?? '';
    const currentReasonId  = (activeRecord.get('variationReasonId') as string | null) ?? null;
    const currentEndDate   = (activeRecord.get('variationEndDate') as string | null) ?? null;
    const hasExisting      = !!activeRecord.get('variationEntryId');

    popup = new Popup({
        header    : `Variation — ${activeRecord.get('projectName') ?? ''}`,
        cls       : 'ts-variation-popup',
        width     : 400,
        modal     : true,
        centered  : true,
        closable  : true,
        autoClose : false,

        items : {
            hoursField : {
                type       : 'numberfield',
                ref        : 'hoursField',
                label      : 'Hours',
                name       : 'hours',
                value      : currentHours,
                min        : 0,
                step       : 0.25,
                clearable  : true,
                weight     : 10,
                labelWidth : '6em',
                style      : 'margin-bottom:0.75em'
            } as Partial<NumberField>,

            reasonField : {
                type         : 'combo',
                ref          : 'reasonField',
                label        : 'Reason',
                name         : 'reason',
                value        : currentReasonId,
                editable     : false,
                clearable    : true,
                weight       : 20,
                labelWidth   : '6em',
                style        : 'margin-bottom:0.75em',
                displayField : 'ws_name',
                valueField   : 'ws_timesheetvariationreasonid',
                items        : reasons.map((r) => ({
                    ws_timesheetvariationreasonid : r.ws_timesheetvariationreasonid,
                    ws_name                       : r.ws_name
                }))
            } as Partial<Combo>,

            endDateField : {
                type       : 'datefield',
                ref        : 'endDateField',
                label      : 'End Date',
                name       : 'endDate',
                value      : currentEndDate ? new Date(currentEndDate) : null,
                clearable  : true,
                weight     : 30,
                labelWidth : '6em',
                style      : 'margin-bottom:0.75em'
            } as Partial<DateField>,

            commentField : {
                type       : 'textareafield',
                ref        : 'commentField',
                label      : 'Comment',
                name       : 'comment',
                value      : currentComment,
                height     : 80,
                weight     : 40,
                labelWidth : '6em',
                style      : 'margin-bottom:0.75em'
            } as Partial<TextAreaField>,

            buttonBar : {
                type   : 'container',
                ref    : 'buttonBar',
                weight : 100,
                cls    : 'ts-variation-buttons',
                layout : 'hbox',
                style  : 'gap:0.5em; justify-content:flex-end; margin-top:0.5em',
                items  : {
                    deleteButton : {
                        type   : 'button',
                        ref    : 'deleteButton',
                        text   : 'Delete',
                        icon   : 'fa fa-trash',
                        cls    : 'b-transparent b-red',
                        hidden : !hasExisting,
                        weight : 10,
                        style  : 'margin-right:auto'
                    } as Partial<Button>,
                    cancelButton : {
                        type   : 'button',
                        ref    : 'cancelButton',
                        text   : 'Cancel',
                        cls    : 'b-transparent',
                        weight : 20
                    } as Partial<Button>,
                    saveButton : {
                        type   : 'button',
                        ref    : 'saveButton',
                        text   : 'Save',
                        icon   : 'fa fa-check',
                        cls    : 'b-raised',
                        weight : 30
                    } as Partial<Button>
                }
            } as Partial<Widget>
        },

        listeners : {
            beforeClose() : void {
                activeRecord = null;
                onSaveCallback = null;
            }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    wirePopupButtons();
}

// ── Internal wiring ─────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function wirePopupButtons() : void {
    if (!popup) return;

    const wm = (popup as any).widgetMap;

    wm.saveButton?.on('click', () => handleDialogSave());
    wm.cancelButton?.on('click', () => closeDialog());
    wm.deleteButton?.on('click', () => handleDialogDelete());

    // Auto-set hours=0 and endDate=today when the "completed" reason is selected
    wm.reasonField?.on('change', ({ value }: { value : string | null }) => {
        const settings = getTimesheetSettings();
        if (
            settings.completedReasonId &&
            value &&
            value.toLowerCase() === settings.completedReasonId.toLowerCase()
        ) {
            wm.hoursField.value   = 0;
            wm.endDateField.value = new Date();
        }
    });
}

function handleDialogSave() : void {
    if (!popup || !activeRecord) return;

    const wm = (popup as any).widgetMap;

    const hours    = (wm.hoursField?.value as number) ?? 0;
    const reason   = (wm.reasonField?.value as string | null) ?? null;
    const endDate  = wm.endDateField?.value as Date | null;
    const comment  = (wm.commentField?.value as string) ?? '';

    // Format end date as ISO string
    let endDateStr : string | null = null;
    if (endDate) {
        endDateStr = endDate.toISOString().split('T')[0]!;
    }

    // Update the record (this feeds into the diffPivotRows save pipeline)
    activeRecord.set('variationTime', hours);
    activeRecord.set('variationComment', comment);
    activeRecord.set('variationReasonId', reason);
    activeRecord.set('variationEndDate', endDateStr);
    activeRecord.set('variationChanged', true);
    activeRecord.set('dirty', true);

    const cb = onSaveCallback;
    closeDialog();

    if (cb) cb();
}

function handleDialogDelete() : void {
    if (!popup || !activeRecord) return;

    // Clear all variation fields
    activeRecord.set('variationTime', 0);
    activeRecord.set('variationComment', '');
    activeRecord.set('variationReasonId', null);
    activeRecord.set('variationEndDate', null);
    activeRecord.set('variationChanged', true);
    activeRecord.set('dirty', true);

    const cb = onSaveCallback;
    closeDialog();

    if (cb) cb();
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function closeDialog() : void {
    if (popup) {
        popup.close();
        popup.destroy();
        popup = null;
    }
    activeRecord = null;
    onSaveCallback = null;
}

/**
 * Tear down the dialog if open (e.g. on view destruction).
 */
export function destroyVariationDialog() : void {
    closeDialog();
    resetVariationReasonCache();
}
