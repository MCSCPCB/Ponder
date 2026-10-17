import { ActionFormData } from "@minecraft/server-ui";
import {
  ANIMATE_PREVIEW_MARKER,
  ANIMATE_PROGRESS_MARKER,
  BUTTON_MARKERS,
  HEADER_TITLE_MARKER,
  MAX_SIDE_ICON_COUNT,
  PROGRESS_MARKER,
  REVERSE_PROGRESS_MARKER,
  TITLE_MARKER,
} from "../../enums/PonderConfig.js";

const DEFAULT_HEADER_ICON_PATH = "textures/ui/ponder/logo";

const getSceneTitlePrefix = scene => `${TITLE_MARKER}${scene.preset.uiTitleMarker}${PROGRESS_MARKER}`;

function createMarkedButtonLabel(id, text) {
  return `${BUTTON_MARKERS[id]}${text}`;
}

function createSceneTitlePayloadLabel(text) {
  return createMarkedButtonLabel("hidden", `${HEADER_TITLE_MARKER}${text}`);
}

function createSpecialBlockIconButtons(specialBlockIcons = []) {
  const buttons = [];

  for (
    let specialBlockIconIndex = 0;
    specialBlockIconIndex < MAX_SIDE_ICON_COUNT;
    specialBlockIconIndex += 1
  ) {
    const specialBlockIcon = specialBlockIcons[specialBlockIconIndex];
    const hasSpecialBlockIcon = Boolean(specialBlockIcon?.iconPath);

    buttons.push({
      id: "noop",
      label: specialBlockIcon?.tooltipText ?? "",
      ...(hasSpecialBlockIcon ? { iconPath: specialBlockIcon.iconPath } : {}),
    });
  }

  return buttons;
}

function createStageButtons(
  stageCount,
  stageIndex,
  sceneTitle,
  sceneIconPath,
  specialBlockIcons,
) {
  const buttons = [
    {
      id: stageIndex > 0 ? "prev" : "noop",
      label:
        stageIndex > 0
          ? createMarkedButtonLabel("prev", "Previous")
          : createMarkedButtonLabel("hidden", ""),
    },
    {
      id: "close",
      label: createMarkedButtonLabel("close", ""),
      iconPath: sceneIconPath,
    },
  ];

  if (stageIndex < stageCount - 1) {
    buttons.push({
      id: "next",
      label: createMarkedButtonLabel("next", stageIndex === 0 ? "Begin" : "Next"),
    });
  } else {
    buttons.push({
      id: "restart",
      label: createMarkedButtonLabel("restart", "Replay"),
    });
  }

  buttons.push({
    id: "noop",
    label: createSceneTitlePayloadLabel(sceneTitle),
  });

  buttons.push(...createSpecialBlockIconButtons(specialBlockIcons));

  return buttons;
}

function getStageProgress(stageCount, stageIndex) {
  return String(Math.round(((stageIndex + 1) * 100) / stageCount));
}


export function createStageForm(
  scene,
  stageIndex,
  animateProgressMode = "none",
  animatePreview = false,
) {
  const stageCount = scene.stages.length;
  const buttons = createStageButtons(
    stageCount,
    stageIndex,
    scene.title ?? "",
    scene.iconPath ?? DEFAULT_HEADER_ICON_PATH,
    scene.specialBlockIcons,
  );
  const animationMarker =
    animateProgressMode === "forward"
      ? ANIMATE_PROGRESS_MARKER
      : animateProgressMode === "reverse"
        ? REVERSE_PROGRESS_MARKER
        : "";
  const form = new ActionFormData()
    .title(
      `${getSceneTitlePrefix(scene)}${getStageProgress(stageCount, stageIndex)}${animationMarker}${animatePreview ? ANIMATE_PREVIEW_MARKER : ""}`,
    )
    .body(scene.title ?? "");

  for (const button of buttons) {
    if (button.iconPath) {
      form.button(button.label, button.iconPath);
      continue;
    }

    form.button(button.label);
  }

  return { form, buttons };
}
