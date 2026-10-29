export function createDesktopInput() {
  const keys = new Set();
  let jump = false;
  let interact = false;

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") event.preventDefault();
    const fresh = !event.repeat && !keys.has(event.code);
    keys.add(event.code);
    if (!fresh) return;
    if (event.code === "Space") jump = true;
    if (event.code === "KeyE") interact = true;
  });
  document.addEventListener("keyup", (event) => keys.delete(event.code));

  return {
    read() {
      let moveX = 0;
      let moveZ = 0;
      if (keys.has("KeyA")) moveX -= 1;
      if (keys.has("KeyD")) moveX += 1;
      if (keys.has("KeyW")) moveZ += 1;
      if (keys.has("KeyS")) moveZ -= 1;
      const sample = {
        moveX,
        moveZ,
        sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        jump,
        interact,
        yaw: 0,
        pitch: 0,
      };
      jump = false;
      interact = false;
      return sample;
    },
  };
}

export function createPhoneInput(root) {
  const stick = root.querySelector("#stick");
  const knob = root.querySelector("#knob");
  const look = root.querySelector("#look");
  const jumpBtn = root.querySelector("#jump");
  const actBtn = root.querySelector("#act");
  let moveX = 0;
  let moveZ = 0;
  let sprint = false;
  let jump = false;
  let interact = false;
  let yaw = 0;
  let pitch = 0;
  let stickId = null;
  let lookId = null;
  let lastX = 0;
  let lastY = 0;

  function placeKnob(x, y) {
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function moveFrom(event) {
    const rect = stick.getBoundingClientRect();
    const max = rect.width * 0.34;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const clamp = Math.min(1, max / len);
    const cx = dx * clamp;
    const cy = dy * clamp;
    moveX = cx / max;
    moveZ = -cy / max;
    sprint = Math.hypot(moveX, moveZ) > 0.92;
    placeKnob(cx, cy);
  }

  function endStick(event) {
    if (event.pointerId !== stickId) return;
    stickId = null;
    moveX = 0;
    moveZ = 0;
    sprint = false;
    placeKnob(0, 0);
  }

  stick.addEventListener("pointerdown", (event) => {
    stick.setPointerCapture(event.pointerId);
    stickId = event.pointerId;
    moveFrom(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickId) moveFrom(event);
  });
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  function endLook(event) {
    if (event.pointerId !== lookId) return;
    lookId = null;
  }

  look.addEventListener("pointerdown", (event) => {
    look.setPointerCapture(event.pointerId);
    lookId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  look.addEventListener("pointermove", (event) => {
    if (event.pointerId !== lookId) return;
    yaw -= (event.clientX - lastX) * 0.005;
    pitch -= (event.clientY - lastY) * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  look.addEventListener("pointerup", endLook);
  look.addEventListener("pointercancel", endLook);

  jumpBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    jump = true;
  });
  actBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    interact = true;
  });

  return {
    read() {
      const sample = { moveX, moveZ, sprint, jump, interact, yaw, pitch };
      jump = false;
      interact = false;
      yaw = 0;
      pitch = 0;
      return sample;
    },
  };
}
