'use strict';

/* "Copy report", in the settings dialog beside Save a debug bundle: a few Markdown lines
 * on the clipboard saying which script this is, which step it is on, what may
 * stop Next there, the last failed calls, the payload's size and the Problems
 * count. What goes in, and how, is decided in core/shared/report.js; this gathers it
 * from the tabs. Mask values applies. */

import { buildReport } from '../core/shared/report.js';
import { countProblems } from '../core/structure/lint.js';
import { Mask } from './mask-setting.js';
import { Features } from './features.js';
import { Targets } from './targets.js';
import { Shared } from './shared.js';
import { copyWithToast } from './clipboard.js';
import { extensionVersion } from './version.js';

/* The Structure tab's dump holds what it judged for the current step. It is
 * asked for with no masking: only names, reasons and counts are taken from it,
 * and none of them leaves the panel except through buildReport. */
function structureFacts() {
  const dump = Shared.dumps((value) => value).structure;
  if (!dump || dump.error || !dump.elementCount) return { stoppers: null, problems: null };
  const step = Shared.step();
  /* Free names neither: its Copy report has no May stop Next list and no Problems line. */
  return {
    stoppers: Features.has('structure.steps') && step && Array.isArray(dump.blockers) ? dump.blockers : null,
    problems: Features.has('structure.problems') && Array.isArray(dump.problems) ? countProblems(dump.problems) : null
  };
}

function gatherReport() {
  const { stoppers, problems } = structureFacts();
  const payload = Shared.payload();
  return {
    script: Targets.selected(),
    step: Shared.step(),
    stoppers,
    failedCalls: Shared.calls(),
    onlyOmni: Shared.onlyOmni(),
    payloadBytes: payload && typeof payload.raw === 'string' ? payload.raw.length : null,
    problems,
    version: extensionVersion()
  };
}

/* The definition is loaded first when Structure has not read it yet, so the
 * report can speak of the step whichever tab was last open. */
export function copyReport() {
  Shared.ensureElements(() => {
    copyWithToast(buildReport(gatherReport(), Mask.apply), 'Copied report');
  });
}
