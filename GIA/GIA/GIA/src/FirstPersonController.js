import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

const HALF_PI = Math.PI * 0.5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function overlapsCircleAabb(x, z, radius, box) {
  const closestX = clamp(x, box.minX, box.maxX);
  const closestZ = clamp(z, box.minZ, box.maxZ);
  return Math.hypot(x - closestX, z - closestZ) < radius;
}

function isTouchDevice() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches;
}

export class FirstPersonController {
  constructor(camera, canvas, world, compassRose = null, audioManager = null) {
    this.camera = camera;
    this.canvas = canvas;
    this.world = world;
    this.compassRose = compassRose;
    this.audioManager = audioManager;
    this.isTouchDevice = isTouchDevice();
    this.moveJoystickEl = document.getElementById("move-joystick");
    this.moveKnobEl = document.getElementById("move-knob");
    this.desktopGuideStateEl = document.getElementById("desktop-guide-state");
    this.desktopGuidePaceEl = document.getElementById("desktop-guide-pace");
    this.hoverGuideEl = document.getElementById("hover-guide");
    this.hoverGuideLabelEl = document.getElementById("hover-guide-label");
    this.hoverGuideActionEl = document.getElementById("hover-guide-action");
    this.hoverGuideSourceEl = document.getElementById("hover-guide-source");
    this.cornerRotateLeftEl = document.getElementById("corner-rotate-left");
    this.cornerRotateRightEl = document.getElementById("corner-rotate-right");
    this.moveTouchId = null;
    this.lookTouchId = null;
    this.lastLookTouchPoint = null;
    this.touchMoveIntent = { forward: 0, strafe: 0 };
    this.touchTapCandidate = null;
    this.touchTapMaxMovement = 18;
    this.touchTapMaxDurationMs = 320;
    this.desktopMode = "browse";
    this.hoveredTarget = null;
    this.activeTarget = null;
    this.focusTransition = null;
    this.browseViewPose = {
      position: camera.position.clone(),
      lookAt: world.spawnPoint.add(new Vector3(0, 0, -6)),
    };
    this.pointer = {
      x: 0,
      y: 0,
      clientX: 0,
      clientY: 0,
      width: 1,
      height: 1,
      inside: false,
    };
    this.cornerRotateZoneDirection = 0;
    this.cornerRotateDirection = 0;
    this.cornerRotateRemaining = 0;
    this.cornerRotateClickAngle = Math.PI * 0.25;
    this.cornerRotateSpeed = 2.2;
    this.cornerRotateMaxSpeed = 2.85;
    this.browseLookHorizontalStrength = 1.15;
    this.browseLookVerticalStrength = 0.62;
    this.orbitAngle = 0;
    this.orbitAngleTarget = 0;
    this.orbitRadius = 0;
    this.orbitRadiusTarget = 0;
    this.orbitTilt = 0;
    this.orbitTiltTarget = 0;
    this.orbitMouseSensitivity = 0.0095;
    this.orbitTiltSensitivity = 0.0075;
    this.orbitTiltLimit = 0.58;
    this.currentLookAt = world.spawnPoint.add(new Vector3(0, 0, -6));

    this.eyeHeight = 1.72;
    this.radius = 0.58;
    this.walkSpeed = 7.8;
    this.mouseSensitivity = 0.0022;
    this.touchSensitivity = 0.0034;
    this.yaw = Math.PI;
    this.pitch = -0.04;

    document.body.classList.toggle("touch-device", this.isTouchDevice);
    this.camera.position.copyFrom(world.spawnPoint);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.browseViewPose = {
      position: this.camera.position.clone(),
      lookAt: this.currentLookAt.clone(),
    };
    this._updateCompass();

    this._bindEvents();
    this._updateDesktopGuide();
  }

  _bindEvents() {
    if (!this.isTouchDevice) {
      const updatePointer = (event) => {
        const previousClientX = this.pointer.clientX;
        const previousClientY = this.pointer.clientY;
        const wasInside = this.pointer.inside;
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = event.clientX - rect.left;
        this.pointer.y = event.clientY - rect.top;
        this.pointer.clientX = event.clientX;
        this.pointer.clientY = event.clientY;
        this.pointer.width = Math.max(1, rect.width);
        this.pointer.height = Math.max(1, rect.height);
        this.pointer.inside =
          this.pointer.x >= 0 &&
          this.pointer.y >= 0 &&
          this.pointer.x <= rect.width &&
          this.pointer.y <= rect.height;
        return {
          deltaX: wasInside ? event.clientX - previousClientX : 0,
          deltaY: wasInside ? event.clientY - previousClientY : 0,
        };
      };

      // Picking throttle: scene.pick() is a CPU-side scene traversal that on
      // a dense PBR scene easily costs 5-15ms per call. A high-Hz mouse fires
      // mousemove 120-240 times/sec, which means picking on every move can
      // consume an entire frame's worth of main-thread time. We now coalesce
      // pointer state synchronously (so orbit/look-around still feel instant),
      // but defer the actual pick to one-per-frame via requestAnimationFrame.
      let _pickScheduled = false;
      const schedulePickUpdate = () => {
        if (_pickScheduled) return;
        _pickScheduled = true;
        requestAnimationFrame(() => {
          _pickScheduled = false;
          if (!this.pointer.inside) return;
          this._updateHoverTarget();
          this._updateCornerRotateZone();
        });
      };

      this.canvas.addEventListener("mousemove", (event) => {
        const { deltaX, deltaY } = updatePointer(event);
        if (this.activeTarget && this.desktopMode !== "browse") {
          this._updateCornerRotateZone();
          this._applyOrbitPointerDelta(deltaX, deltaY);
          return;
        }
        schedulePickUpdate();
      });

      this.canvas.addEventListener("mouseenter", (event) => {
        updatePointer(event);
        this._updateHoverTarget();
        this._updateCornerRotateZone();
      });

      this.canvas.addEventListener("mouseleave", () => {
        this.pointer.inside = false;
        this._setCornerRotateZoneDirection(0);
        this._setCornerRotateDirection(0);
        this._setHoveredTarget(null);
      });

      this.canvas.addEventListener("mousedown", (event) => {
        this.audioManager?.unlock();
        if (event.button !== 0) {
          return;
        }
        updatePointer(event);
        this._updateCornerRotateZone();
        if (this.cornerRotateZoneDirection !== 0) {
          event.preventDefault();
          this._beginCornerRotate(this.cornerRotateZoneDirection);
        }
      });

      this.canvas.addEventListener("click", (event) => {
        this.audioManager?.unlock();
        updatePointer(event);
        this._updateCornerRotateZone();
        if (this.cornerRotateZoneDirection !== 0) {
          event.preventDefault();
          return;
        }
        const target = this._pickShowcaseTargetAtPointer();
        if (target) {
          event.preventDefault();
          this.audioManager?.playClick();
          this.audioManager?.playShowcaseAccent();
          this.focusShowcaseTarget(target);
          return;
        }

        const floorPoint = this._pickFloorPointAtPointer();
        if (floorPoint) {
          event.preventDefault();
          this.audioManager?.playClick();
          this.audioManager?.playMoveAccent();
          this.flyToFloorPoint(floorPoint);
          return;
        }

        if (this.activeTarget) {
          event.preventDefault();
          this.audioManager?.playClick();
          this.exitShowcaseFocus();
        }
      });

      window.addEventListener(
        "wheel",
        (event) => {
          if (!this.activeTarget || !this.pointer.inside) {
            return;
          }
          event.preventDefault();
          const direction = Math.sign(event.deltaY);
          if (direction === 0) {
            return;
          }
          const minRadius = Math.max(1.45, this.activeTarget.orbitRadius * 0.78);
          const maxRadius = Math.max(minRadius + 0.3, this.activeTarget.orbitRadius * 1.55);
          this.orbitRadiusTarget = clamp(this.orbitRadiusTarget + direction * 0.2, minRadius, maxRadius);
          this._updateDesktopGuide();
        },
        { passive: false },
      );

      window.addEventListener("blur", () => {
        this._setCornerRotateZoneDirection(0);
        this._setCornerRotateDirection(0);
        this.cornerRotateRemaining = 0;
        if (this.pointer.inside) {
          this.pointer.inside = false;
          this._setHoveredTarget(null);
        }
      });

      window.addEventListener("mouseup", () => {
        this._setCornerRotateDirection(0);
      });

      this._bindCornerRotateButton(this.cornerRotateLeftEl, -1);
      this._bindCornerRotateButton(this.cornerRotateRightEl, 1);

      window.addEventListener("resize", () => {
        if (!this.pointer.inside || !this.hoveredTarget) {
          return;
        }
        this._positionHoverGuide();
      });
      return;
    }

    const onTouchStart = (event) => {
      this.audioManager?.unlock();
      let handled = false;
      for (const touch of event.changedTouches) {
        if (this.desktopMode === "browse" && this.moveTouchId == null && this._isInsideMoveJoystick(touch)) {
          this.moveTouchId = touch.identifier;
          this._updateMoveTouch(touch);
          handled = true;
          continue;
        }
        if (this.lookTouchId == null) {
          this.lookTouchId = touch.identifier;
          this.lastLookTouchPoint = { x: touch.clientX, y: touch.clientY };
          this.touchTapCandidate = {
            identifier: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            startedAt: Date.now(),
            moved: false,
          };
          handled = true;
        }
      }
      if (handled) {
        event.preventDefault();
      }
    };

    const onTouchMove = (event) => {
      let handled = false;
      for (const touch of event.changedTouches) {
        if (touch.identifier === this.moveTouchId) {
          this._updateMoveTouch(touch);
          handled = true;
        } else if (touch.identifier === this.lookTouchId) {
          if (this.touchTapCandidate?.identifier === touch.identifier) {
            this.touchTapCandidate.lastX = touch.clientX;
            this.touchTapCandidate.lastY = touch.clientY;
            const movement = Math.hypot(
              touch.clientX - this.touchTapCandidate.startX,
              touch.clientY - this.touchTapCandidate.startY,
            );
            if (!this.touchTapCandidate.moved && movement > this.touchTapMaxMovement) {
              this.touchTapCandidate.moved = true;
              this.lastLookTouchPoint = { x: touch.clientX, y: touch.clientY };
            }
          }
          if (this.touchTapCandidate?.identifier !== touch.identifier || this.touchTapCandidate.moved) {
            this._updateLookTouch(touch);
          }
          handled = true;
        }
      }
      if (handled) {
        event.preventDefault();
      }
    };

    const onTouchEnd = (event) => {
      let handled = false;
      for (const touch of event.changedTouches) {
        if (touch.identifier === this.moveTouchId) {
          this._resetMoveTouch();
          handled = true;
        }
        if (touch.identifier === this.lookTouchId) {
          const tapCandidate = this.touchTapCandidate;
          const tapDuration = tapCandidate ? Date.now() - tapCandidate.startedAt : Number.POSITIVE_INFINITY;
          const tapMovement = tapCandidate
            ? Math.hypot(
                (tapCandidate.lastX ?? touch.clientX) - tapCandidate.startX,
                (tapCandidate.lastY ?? touch.clientY) - tapCandidate.startY,
              )
            : Number.POSITIVE_INFINITY;
          const isTap =
            tapCandidate?.identifier === touch.identifier &&
            !tapCandidate.moved &&
            tapMovement <= this.touchTapMaxMovement &&
            tapDuration <= this.touchTapMaxDurationMs;
          this.lookTouchId = null;
          this.lastLookTouchPoint = null;
          this.touchTapCandidate = null;
          handled = true;
          if (isTap && this.desktopMode !== "transition") {
            this._handleTouchTap(touch.clientX, touch.clientY);
          }
        }
      }
      if (handled) {
        event.preventDefault();
      }
    };

    this.canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: false });
    window.addEventListener("touchcancel", onTouchEnd, { passive: false });
  }

  update(delta) {
    const clampedDelta = Math.min(delta, 0.05);

    if (this.isTouchDevice) {
      if (this.desktopMode === "transition" && this.focusTransition) {
        this._updateDesktopFocusTransition(clampedDelta);
      } else if (this.desktopMode === "orbit" && this.activeTarget) {
        this._updateDesktopOrbit(clampedDelta);
      } else {
        const forwardIntent = clamp(this.touchMoveIntent.forward, -1, 1);
        const strafeIntent = clamp(this.touchMoveIntent.strafe, -1, 1);
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const forward = new Vector3(sin, 0, cos);
        const right = new Vector3(cos, 0, -sin);
        const move = forward.scale(forwardIntent).addInPlace(right.scale(strafeIntent));

        if (move.lengthSquared() > 0) {
          move.normalize();
          move.scaleInPlace(this.walkSpeed * clampedDelta);
          this._tryMove(move.x, move.z);
        }
        this.camera.position.y = this.eyeHeight;
        this.camera.rotation.set(this.pitch, this.yaw, 0);
        this._syncTouchBrowsePose();
      }
      this._updateAudioContext();
    } else {
      if (this.desktopMode === "transition" && this.focusTransition) {
        this._updateDesktopFocusTransition(clampedDelta);
      } else if (this.desktopMode === "orbit" && this.activeTarget) {
        this._updateDesktopOrbit(clampedDelta);
      } else if (this.desktopMode === "browse") {
        this._updateDesktopBrowseLook(clampedDelta);
      }
      this._updateAudioContext();
    }

    this._updateCompass();
  }

  _updateAudioContext() {
    const position = this.camera.position;
    const inShopArea = Math.abs(position.x) > 18 && position.z > 56 && position.z < 96;
    const inCorridor = Math.abs(position.x) < 16 && position.z > 108;
    const inMainHall = !inShopArea && !inCorridor;
    const focusingItem = this.desktopMode === "orbit" || this.activeTarget != null;
    this.audioManager?.setShopEnergy(inShopArea || focusingItem);
    this.audioManager?.setHallAtmosphere(inMainHall && !focusingItem);
    this.audioManager?.setCorridorAtmosphere(inCorridor && !focusingItem);
    this.audioManager?.setMainHallSynth(inMainHall && !focusingItem);
  }

  focusShowcaseTarget(target) {
    if (!target) {
      return;
    }

    const desiredPose = this._findOrbitPoseForTarget(target);
    const startPosition = this.camera.position.clone();
    const startLookAt = this.currentLookAt.clone();
    const distance = Vector3.Distance(startPosition, desiredPose.position);

    if (!this.activeTarget || this.desktopMode === "browse") {
      this.browseViewPose = {
        position: startPosition.clone(),
        lookAt: startLookAt.clone(),
      };
    }

    this.activeTarget = target;
    this.audioManager?.startFly(distance);
    this.focusTransition = {
      target,
      fromPosition: startPosition,
      toPosition: desiredPose.position,
      fromLookAt: startLookAt,
      toLookAt: target.focusPoint.clone(),
      duration: clamp(0.58 + distance * 0.09, 0.58, 1.35),
      elapsed: 0,
      completeMode: "orbit",
      endAngle: desiredPose.angle,
      endRadius: desiredPose.radius,
      endTilt: 0,
    };
    this.desktopMode = "transition";
    this._setCornerRotateZoneDirection(0);
    this._setCornerRotateDirection(0);
    this.cornerRotateRemaining = 0;
    this.orbitAngle = desiredPose.angle;
    this.orbitAngleTarget = desiredPose.angle;
    this.orbitRadius = desiredPose.radius;
    this.orbitRadiusTarget = desiredPose.radius;
    this.orbitTilt = 0;
    this.orbitTiltTarget = 0;
    this._setHoveredTarget(target);
    this._updateDesktopGuide();
  }

  exitShowcaseFocus() {
    if (!this.activeTarget && this.desktopMode === "browse") {
      return;
    }

    const returnPose = this.browseViewPose ?? {
      position: this.world.spawnPoint.clone(),
      lookAt: this.currentLookAt.clone(),
    };
    const startPosition = this.camera.position.clone();
    const startLookAt = this.currentLookAt.clone();
    const distance = Vector3.Distance(startPosition, returnPose.position);

    this.focusTransition = {
      target: null,
      fromPosition: startPosition,
      toPosition: returnPose.position.clone(),
      fromLookAt: startLookAt,
      toLookAt: returnPose.lookAt.clone(),
      duration: clamp(0.5 + distance * 0.08, 0.5, 1.15),
      elapsed: 0,
      completeMode: "browse",
      endAngle: this.orbitAngle,
      endRadius: this.orbitRadius,
      endTilt: 0,
    };
    this.desktopMode = "transition";
    this.audioManager?.startFly(distance);
    this.activeTarget = null;
    this._setCornerRotateZoneDirection(0);
    this._setCornerRotateDirection(0);
    this.cornerRotateRemaining = 0;
    this._setHoveredTarget(null);
    this._updateDesktopGuide();
  }

  flyToFloorPoint(floorPoint) {
    if (!floorPoint) {
      return;
    }

    const destinationPose = this._findBrowsePoseForFloorPoint(floorPoint);
    const startPosition = this.camera.position.clone();
    const startLookAt = this.currentLookAt.clone();
    const distance = Vector3.Distance(startPosition, destinationPose.position);

    this.focusTransition = {
      target: null,
      fromPosition: startPosition,
      toPosition: destinationPose.position,
      fromLookAt: startLookAt,
      toLookAt: destinationPose.lookAt,
      duration: clamp(0.52 + distance * 0.075, 0.52, 1.2),
      elapsed: 0,
      completeMode: "browse",
      endAngle: this.orbitAngle,
      endRadius: this.orbitRadius,
      endTilt: 0,
    };
    this.desktopMode = "transition";
    this.audioManager?.startFly(distance);
    this.activeTarget = null;
    this._setCornerRotateZoneDirection(0);
    this._setCornerRotateDirection(0);
    this.cornerRotateRemaining = 0;
    this._setHoveredTarget(null);
    this._updateDesktopGuide();
  }

  _updateDesktopFocusTransition(delta) {
    const transition = this.focusTransition;
    if (!transition) {
      return;
    }

    transition.elapsed += delta;
    const progress = clamp(transition.elapsed / transition.duration, 0, 1);
    const eased = easeInOutCubic(progress);
    const position = Vector3.Lerp(transition.fromPosition, transition.toPosition, eased);
    const lookAt = Vector3.Lerp(transition.fromLookAt, transition.toLookAt, eased);
    this._applyCameraPose(position, lookAt);

    if (progress >= 1) {
      this.audioManager?.stopFly();
      if (transition.completeMode === "orbit" && transition.target) {
        this.audioManager?.playFocusBloom();
        this.desktopMode = "orbit";
        this.activeTarget = transition.target;
        this.orbitAngle = transition.endAngle;
        this.orbitAngleTarget = transition.endAngle;
        this.orbitRadius = transition.endRadius;
        this.orbitRadiusTarget = transition.endRadius;
        this.orbitTilt = transition.endTilt ?? 0;
        this.orbitTiltTarget = transition.endTilt ?? 0;
      } else {
        this.desktopMode = "browse";
        this.activeTarget = null;
        this.orbitTilt = 0;
        this.orbitTiltTarget = 0;
        this.browseViewPose = {
          position: transition.toPosition.clone(),
          lookAt: transition.toLookAt.clone(),
        };
        this._setHoveredTarget(this.pointer.inside ? this._pickShowcaseTargetAtPointer() : null);
      }
      this.focusTransition = null;
      this._updateDesktopGuide();
    }
  }

  _updateDesktopOrbit(delta) {
    const target = this.activeTarget;
    if (!target) {
      return;
    }

    const desiredPose = this._findOrbitPoseForTarget(target, this.orbitAngleTarget, this.orbitRadiusTarget);
    const desiredLookAt = target.focusPoint.clone();
    this.orbitAngle += (desiredPose.angle - this.orbitAngle) * (1 - Math.exp(-7.8 * delta));
    this.orbitRadius += (desiredPose.radius - this.orbitRadius) * (1 - Math.exp(-6 * delta));
    this.orbitTilt += (this.orbitTiltTarget - this.orbitTilt) * (1 - Math.exp(-6.6 * delta));

    const horizontalRadius = this.orbitRadius * Math.max(0.45, Math.cos(this.orbitTilt));
    const verticalLift = Math.sin(this.orbitTilt) * this.orbitRadius * 0.94;

    const desiredPosition = new Vector3(
      target.focusPoint.x + Math.sin(this.orbitAngle) * horizontalRadius,
      target.cameraY + verticalLift,
      target.focusPoint.z + Math.cos(this.orbitAngle) * horizontalRadius,
    );

    const position = Vector3.Lerp(this.camera.position, desiredPosition, 1 - Math.exp(-5.2 * delta));
    const lookAt = Vector3.Lerp(this.currentLookAt, desiredLookAt, 1 - Math.exp(-7.2 * delta));

    this._applyCameraPose(position, lookAt);
  }

  _updateDesktopBrowseLook(delta) {
    const basePose = this.browseViewPose ?? {
      position: this.camera.position.clone(),
      lookAt: this.currentLookAt.clone(),
    };
    const position = this.camera.position.clone();
    let baseLookAt = basePose.lookAt.clone();
    let horizontalDirection = baseLookAt.subtract(position);
    horizontalDirection.y = 0;

    if (horizontalDirection.lengthSquared() < 0.001) {
      horizontalDirection = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    } else {
      horizontalDirection.normalize();
    }

    const horizontalDistance = Math.max(
      6.2,
      Math.hypot(baseLookAt.x - position.x, baseLookAt.z - position.z),
    );
    const verticalOffset = clamp(baseLookAt.y - position.y, -0.8, 0.45);

    if (this.cornerRotateDirection !== 0) {
      this.cornerRotateRemaining += this.cornerRotateDirection * this.cornerRotateSpeed * delta;
    }

    let rotatedThisFrame = false;
    if (Math.abs(this.cornerRotateRemaining) > 0.0001) {
      const currentAngle = Math.atan2(horizontalDirection.x, horizontalDirection.z);
      const maxStep = this.cornerRotateMaxSpeed * delta;
      const angleStep = clamp(this.cornerRotateRemaining, -maxStep, maxStep);
      const nextAngle = currentAngle + angleStep;
      this.cornerRotateRemaining -= angleStep;
      rotatedThisFrame = true;
      horizontalDirection = new Vector3(Math.sin(nextAngle), 0, Math.cos(nextAngle));
      baseLookAt = position.add(
        new Vector3(
          horizontalDirection.x * horizontalDistance,
          verticalOffset,
          horizontalDirection.z * horizontalDistance,
        ),
      );
      this.browseViewPose = {
        position: position.clone(),
        lookAt: baseLookAt.clone(),
      };
    }

    const targetUnderPointer = this.pointer.inside ? this._pickShowcaseTargetAtPointer() : null;
    if (targetUnderPointer && this.hoveredTarget?.id !== targetUnderPointer.id) {
      this._setHoveredTarget(targetUnderPointer);
    }

    if (
      !rotatedThisFrame &&
      this.cornerRotateDirection === 0 &&
      (this.cornerRotateZoneDirection !== 0 || this.hoveredTarget || targetUnderPointer)
    ) {
      return;
    }

    let desiredLookAt = baseLookAt;
    if (this.pointer.inside && this.cornerRotateDirection === 0 && !rotatedThisFrame) {
      const pointerX = clamp((this.pointer.x / this.pointer.width - 0.5) * 2, -1, 1);
      const pointerY = clamp((this.pointer.y / this.pointer.height - 0.5) * 2, -1, 1);
      const right = new Vector3(horizontalDirection.z, 0, -horizontalDirection.x);
      desiredLookAt = baseLookAt
        .add(right.scale(pointerX * this.browseLookHorizontalStrength))
        .add(new Vector3(0, -pointerY * this.browseLookVerticalStrength, 0));
    }

    const lookAt = Vector3.Lerp(this.currentLookAt, desiredLookAt, 1 - Math.exp(-5.4 * delta));
    this._applyCameraPose(position, lookAt);
  }

  _rotateBrowseViewBy(direction, radians) {
    const position = this.camera.position.clone();
    const basePose = this.browseViewPose ?? {
      position: position.clone(),
      lookAt: this.currentLookAt.clone(),
    };
    let horizontalDirection = basePose.lookAt.subtract(position);
    horizontalDirection.y = 0;

    if (horizontalDirection.lengthSquared() < 0.001) {
      horizontalDirection = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    } else {
      horizontalDirection.normalize();
    }

    const horizontalDistance = Math.max(
      6.2,
      Math.hypot(basePose.lookAt.x - position.x, basePose.lookAt.z - position.z),
    );
    const verticalOffset = clamp(basePose.lookAt.y - position.y, -0.8, 0.45);
    const currentAngle = Math.atan2(horizontalDirection.x, horizontalDirection.z);
    const nextAngle = currentAngle + direction * radians;
    const nextLookAt = position.add(
      new Vector3(
        Math.sin(nextAngle) * horizontalDistance,
        verticalOffset,
        Math.cos(nextAngle) * horizontalDistance,
      ),
    );

    this.browseViewPose = {
      position: position.clone(),
      lookAt: nextLookAt.clone(),
    };
    this._applyCameraPose(position, nextLookAt);
  }

  _applyOrbitPointerDelta(deltaX, deltaY) {
    if (!this.activeTarget || this.desktopMode === "browse") {
      return;
    }

    if (Math.abs(deltaX) > 0.0001) {
      this.orbitAngleTarget += deltaX * this.orbitMouseSensitivity;
    }
    if (Math.abs(deltaY) > 0.0001) {
      this.orbitTiltTarget = clamp(
        this.orbitTiltTarget + deltaY * this.orbitTiltSensitivity,
        -this.orbitTiltLimit,
        this.orbitTiltLimit,
      );
    }
  }

  _findOrbitPoseForTarget(target, preferredAngle = null, preferredRadius = null) {
    const angleBase = preferredAngle ?? this._getPreferredOrbitAngle(target);
    const baseRadius = preferredRadius ?? target.orbitRadius;
    const angleOffsets = [0, 0.34, -0.34, 0.72, -0.72, 1.16, -1.16, Math.PI];
    const radiusOffsets = [0, 0.18, 0.42, 0.72, 1];

    for (const radiusOffset of radiusOffsets) {
      const radius = baseRadius + radiusOffset;
      for (const angleOffset of angleOffsets) {
        const angle = angleBase + angleOffset;
        const position = new Vector3(
          target.focusPoint.x + Math.sin(angle) * radius,
          target.cameraY,
          target.focusPoint.z + Math.cos(angle) * radius,
        );
        if (this._isValidDesktopPosition(position)) {
          return { position, angle, radius };
        }
      }
    }

    const fallbackRadius = baseRadius + 1.1;
    const fallbackAngle = angleBase + Math.PI;
    return {
      position: new Vector3(
        clamp(
          target.focusPoint.x + Math.sin(fallbackAngle) * fallbackRadius,
          this.world.bounds.minX + this.radius,
          this.world.bounds.maxX - this.radius,
        ),
        target.cameraY,
        clamp(
          target.focusPoint.z + Math.cos(fallbackAngle) * fallbackRadius,
          this.world.bounds.minZ + this.radius,
          this.world.bounds.maxZ - this.radius,
        ),
      ),
      angle: fallbackAngle,
      radius: fallbackRadius,
    };
  }

  _getPreferredOrbitAngle(target) {
    const offsetX = this.camera.position.x - target.focusPoint.x;
    const offsetZ = this.camera.position.z - target.focusPoint.z;
    if (Math.hypot(offsetX, offsetZ) > 0.12) {
      return Math.atan2(offsetX, offsetZ);
    }
    return target.preferredAngle ?? Math.PI;
  }

  _isValidDesktopPosition(position) {
    if (
      position.x < this.world.bounds.minX + this.radius ||
      position.x > this.world.bounds.maxX - this.radius ||
      position.z < this.world.bounds.minZ + this.radius ||
      position.z > this.world.bounds.maxZ - this.radius
    ) {
      return false;
    }
    if (typeof this.world.isNavigableFloorPoint === "function" && !this.world.isNavigableFloorPoint(position)) {
      return false;
    }
    return !this._collides(position.x, position.z);
  }

  _applyCameraPose(position, lookAt) {
    this.camera.position.copyFrom(position);
    this.camera.setTarget(lookAt);
    this.currentLookAt.copyFrom(lookAt);
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
  }

  _syncTouchBrowsePose() {
    const lookDistance = 6.2;
    const ray = this.camera.getForwardRay(lookDistance);
    const lookAt = this.camera.position.add(ray.direction.scale(lookDistance));
    this.currentLookAt.copyFrom(lookAt);
    this.browseViewPose = {
      position: this.camera.position.clone(),
      lookAt: lookAt.clone(),
    };
  }

  _pickShowcaseTargetAtPointer() {
    if (!this.pointer.inside) {
      return null;
    }
    return this.world.pickShowcaseTarget(this.pointer.x, this.pointer.y, this.camera);
  }

  _pickFloorPointAtPointer() {
    if (!this.pointer.inside) {
      return null;
    }
    return this.world.pickNavigableFloorPoint(this.pointer.x, this.pointer.y, this.camera);
  }

  _getCanvasPointFromClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x,
      y,
      inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
    };
  }

  _pickShowcaseTargetAtClient(clientX, clientY) {
    const point = this._getCanvasPointFromClient(clientX, clientY);
    if (!point.inside) {
      return null;
    }
    return this.world.pickShowcaseTarget(point.x, point.y, this.camera);
  }

  _pickFloorPointAtClient(clientX, clientY) {
    const point = this._getCanvasPointFromClient(clientX, clientY);
    if (!point.inside) {
      return null;
    }
    return this.world.pickNavigableFloorPoint(point.x, point.y, this.camera);
  }

  _handleTouchTap(clientX, clientY) {
    const target = this._pickShowcaseTargetAtClient(clientX, clientY);
    if (target) {
      this.audioManager?.playClick();
      this.audioManager?.playShowcaseAccent();
      this.focusShowcaseTarget(target);
      return;
    }

    const floorPoint = this._pickFloorPointAtClient(clientX, clientY);
    if (floorPoint) {
      this.audioManager?.playClick();
      this.audioManager?.playMoveAccent();
      this.flyToFloorPoint(floorPoint);
      return;
    }

    if (this.activeTarget) {
      this.audioManager?.playClick();
      this.exitShowcaseFocus();
    }
  }

  _findBrowsePoseForFloorPoint(floorPoint) {
    const currentPosition = this.camera.position;
    const currentLookAt = this.currentLookAt;
    let direction = new Vector3(floorPoint.x - currentPosition.x, 0, floorPoint.z - currentPosition.z);
    if (direction.lengthSquared() < 0.001) {
      direction = currentLookAt.subtract(currentPosition);
      direction.y = 0;
    }
    if (direction.lengthSquared() < 0.001) {
      direction = new Vector3(0, 0, -1);
    } else {
      direction.normalize();
    }

    const basePosition = new Vector3(floorPoint.x, this.eyeHeight, floorPoint.z);
    const resolvedPosition = this._resolveNavigableBrowsePosition(basePosition, direction);
    const lookAt = resolvedPosition.add(new Vector3(direction.x * 6.2, -0.18, direction.z * 6.2));
    return { position: resolvedPosition, lookAt };
  }

  _resolveNavigableBrowsePosition(basePosition, direction) {
    const baseX = clamp(
      basePosition.x,
      this.world.bounds.minX + this.radius,
      this.world.bounds.maxX - this.radius,
    );
    const baseZ = clamp(
      basePosition.z,
      this.world.bounds.minZ + this.radius,
      this.world.bounds.maxZ - this.radius,
    );

    const baseCandidate = new Vector3(baseX, this.eyeHeight, baseZ);
    if (this._isValidDesktopPosition(baseCandidate)) {
      return baseCandidate;
    }

    const baseAngle = Math.atan2(direction.x, direction.z);
    const radiusSteps = [0.35, 0.7, 1.05, 1.4, 1.8, 2.25];
    const angleOffsets = [Math.PI, Math.PI * 0.66, -Math.PI * 0.66, Math.PI * 0.33, -Math.PI * 0.33, Math.PI * 0.5, -Math.PI * 0.5, 0];

    for (const radius of radiusSteps) {
      for (const angleOffset of angleOffsets) {
        const angle = baseAngle + angleOffset;
        const candidateX = clamp(
          basePosition.x + Math.sin(angle) * radius,
          this.world.bounds.minX + this.radius,
          this.world.bounds.maxX - this.radius,
        );
        const candidateZ = clamp(
          basePosition.z + Math.cos(angle) * radius,
          this.world.bounds.minZ + this.radius,
          this.world.bounds.maxZ - this.radius,
        );
        const candidate = new Vector3(candidateX, this.eyeHeight, candidateZ);
        if (this._isValidDesktopPosition(candidate)) {
          return candidate;
        }
      }
    }

    return new Vector3(baseX, this.eyeHeight, baseZ);
  }

  _updateHoverTarget() {
    if (!this.pointer.inside) {
      this._setHoveredTarget(null);
      return;
    }
    this._setHoveredTarget(this._pickShowcaseTargetAtPointer());
  }

  _updateCornerRotateZone() {
    if (this.isTouchDevice || !this.pointer.inside || this.desktopMode !== "browse") {
      this._setCornerRotateZoneDirection(0);
      this._setCornerRotateDirection(0);
      return;
    }

    const zoneWidth = Math.min(210, this.pointer.width * 0.22);
    const zoneHeight = Math.min(170, this.pointer.height * 0.28);
    const inBottomZone = this.pointer.y >= this.pointer.height - zoneHeight;
    if (!inBottomZone) {
      this._setCornerRotateZoneDirection(0);
      return;
    }

    if (this.pointer.x <= zoneWidth) {
      this._setCornerRotateZoneDirection(-1);
    } else if (this.pointer.x >= this.pointer.width - zoneWidth) {
      this._setCornerRotateZoneDirection(1);
    } else {
      this._setCornerRotateZoneDirection(0);
    }
  }

  _bindCornerRotateButton(button, direction) {
    if (!button) {
      return;
    }

    button.addEventListener("mouseenter", () => {
      if (this.desktopMode === "browse") {
        this._setCornerRotateZoneDirection(direction);
      }
    });
    button.addEventListener("mouseleave", () => {
      this._setCornerRotateZoneDirection(0);
    });
    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || this.desktopMode !== "browse") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this._beginCornerRotate(direction);
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  _beginCornerRotate(direction) {
    if (direction === 0 || this.desktopMode !== "browse") {
      return;
    }

    this._syncBrowsePoseToCurrentView();
    this._setCornerRotateZoneDirection(direction);
    this.cornerRotateRemaining += direction * this.cornerRotateClickAngle;
    this._setCornerRotateDirection(direction);
  }

  _syncBrowsePoseToCurrentView() {
    this.browseViewPose = {
      position: this.camera.position.clone(),
      lookAt: this.currentLookAt.clone(),
    };
  }

  _setCornerRotateZoneDirection(direction) {
    if (this.cornerRotateZoneDirection === direction) {
      return;
    }

    if (direction !== 0 && this.cornerRotateZoneDirection === 0 && this.desktopMode === "browse") {
      this._syncBrowsePoseToCurrentView();
    }
    this.cornerRotateZoneDirection = direction;
    this._refreshCornerRotateIcons();
  }

  _setCornerRotateDirection(direction) {
    if (this.cornerRotateDirection === direction) {
      return;
    }

    this.cornerRotateDirection = direction;
    this._refreshCornerRotateIcons();
  }

  _refreshCornerRotateIcons() {
    const visibleDirection = this.cornerRotateDirection || this.cornerRotateZoneDirection;
    this.cornerRotateLeftEl?.classList.toggle("corner-rotate--visible", visibleDirection < 0);
    this.cornerRotateRightEl?.classList.toggle("corner-rotate--visible", visibleDirection > 0);
  }

  _updateCompass() {
    if (!this.compassRose) {
      return;
    }

    this.compassRose.style.transform = `rotate(${this.yaw - Math.PI}rad)`;
  }

  _applyLookDelta(deltaX, deltaY, sensitivity) {
    this.yaw += deltaX * sensitivity;
    this.pitch = clamp(
      this.pitch + deltaY * sensitivity,
      -HALF_PI + 0.08,
      HALF_PI - 0.08,
    );
  }

  _updateDesktopGuide() {
    if (this.isTouchDevice) {
      return;
    }

    const orbiting = this.desktopMode === "orbit";
    const navigating = this.desktopMode === "transition";
    document.body.classList.toggle("hovering-showcase", !!this.hoveredTarget);
    document.body.classList.toggle("orbiting-showcase", orbiting);
    document.body.classList.toggle("navigating-showcase", navigating);

    if (this.desktopGuideStateEl) {
      let state = "Hover any item";
      if (navigating && this.activeTarget) {
        state = `Flying to ${this._describeTarget(this.activeTarget)}`;
      } else if (orbiting && this.activeTarget) {
        state = `Orbiting ${this._describeTarget(this.activeTarget)}`;
      } else if (this.hoveredTarget) {
        state = `Inspect ${this._describeTarget(this.hoveredTarget)}`;
      }
      this.desktopGuideStateEl.textContent = state;
    }

    if (this.desktopGuidePaceEl) {
      this.desktopGuidePaceEl.textContent = this.activeTarget
        ? "Move the mouse to orbit and tilt. Use the wheel for distance. Click the floor/background to exit focus."
        : "Click items to focus, click open floor to fly, or click-hold a bottom corner to rotate in place.";
    }

    this._updateHoverGuide();
  }

  _describeTarget(target) {
    if (!target) {
      return "item";
    }
    if (target.kind === "mannequin") {
      return "look";
    }
    return target.kind ?? "item";
  }

  _setHoveredTarget(target) {
    if (this.hoveredTarget?.id === target?.id) {
      if (target) {
        this._positionHoverGuide();
      }
      this._updateHoverGuide();
      this._updateDesktopGuide();
      return;
    }

    this.hoveredTarget = target;
    this._updateHoverGuide();
    this._updateDesktopGuide();
  }

  _updateHoverGuide() {
    if (!this.hoverGuideEl) {
      return;
    }

    const visible =
      !!this.hoveredTarget &&
      this.pointer.inside &&
      !this.isTouchDevice &&
      this.desktopMode === "browse";
    this.hoverGuideEl.classList.toggle("hover-guide--visible", visible);
    if (!visible) {
      return;
    }

    if (this.hoverGuideLabelEl) {
      this.hoverGuideLabelEl.textContent = this.hoveredTarget.label ?? "Inspect item";
    }
    if (this.hoverGuideActionEl) {
      this.hoverGuideActionEl.textContent = "Click to fly here and orbit";
    }
    if (this.hoverGuideSourceEl) {
      const sourceFileName = this.hoveredTarget?.sourceFileName ?? null;
      this.hoverGuideSourceEl.hidden = !sourceFileName;
      this.hoverGuideSourceEl.textContent = sourceFileName ? `GLB: ${sourceFileName}` : "";
    }
    this._positionHoverGuide();
  }

  _positionHoverGuide() {
    if (!this.hoverGuideEl || !this.pointer.inside) {
      return;
    }

    const maxX = Math.max(12, window.innerWidth - 320);
    const maxY = Math.max(12, window.innerHeight - 96);
    const x = clamp(this.pointer.clientX + 18, 12, maxX);
    const y = clamp(this.pointer.clientY + 18, 12, maxY);
    this.hoverGuideEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  _isInsideMoveJoystick(touch) {
    if (!this.moveJoystickEl) {
      return touch.clientX < window.innerWidth * 0.42 && touch.clientY > window.innerHeight * 0.55;
    }

    const rect = this.moveJoystickEl.getBoundingClientRect();
    const padding = 18;
    return (
      touch.clientX >= rect.left - padding &&
      touch.clientX <= rect.right + padding &&
      touch.clientY >= rect.top - padding &&
      touch.clientY <= rect.bottom + padding
    );
  }

  _updateMoveTouch(touch) {
    if (!this.moveJoystickEl || !this.moveKnobEl) {
      return;
    }

    const rect = this.moveJoystickEl.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const maxRadius = rect.width * 0.28;
    const rawX = touch.clientX - centerX;
    const rawY = touch.clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxRadius ? maxRadius / distance : 1;
    const clampedX = rawX * scale;
    const clampedY = rawY * scale;

    this.touchMoveIntent.strafe = clamp(clampedX / maxRadius, -1, 1);
    this.touchMoveIntent.forward = clamp(-clampedY / maxRadius, -1, 1);
    this.moveJoystickEl.classList.add("mobile-control--active");
    this.moveKnobEl.style.transform = `translate(-50%, -50%) translate(${clampedX}px, ${clampedY}px)`;
  }

  _resetMoveTouch() {
    this.moveTouchId = null;
    this.touchMoveIntent.forward = 0;
    this.touchMoveIntent.strafe = 0;
    this.moveJoystickEl?.classList.remove("mobile-control--active");
    if (this.moveKnobEl) {
      this.moveKnobEl.style.transform = "translate(-50%, -50%)";
    }
  }

  _updateLookTouch(touch) {
    if (!this.lastLookTouchPoint) {
      this.lastLookTouchPoint = { x: touch.clientX, y: touch.clientY };
      return;
    }

    const deltaX = touch.clientX - this.lastLookTouchPoint.x;
    const deltaY = touch.clientY - this.lastLookTouchPoint.y;
    if (this.activeTarget && this.desktopMode === "orbit") {
      this._applyOrbitPointerDelta(deltaX, deltaY);
    } else {
      this._applyLookDelta(deltaX, deltaY, this.touchSensitivity);
    }
    this.lastLookTouchPoint = { x: touch.clientX, y: touch.clientY };
  }

  _tryMove(dx, dz) {
    const position = this.camera.position;
    const nextX = clamp(
      position.x + dx,
      this.world.bounds.minX + this.radius,
      this.world.bounds.maxX - this.radius,
    );
    if (!this._collides(nextX, position.z)) {
      position.x = nextX;
    }

    const nextZ = clamp(
      position.z + dz,
      this.world.bounds.minZ + this.radius,
      this.world.bounds.maxZ - this.radius,
    );
    if (!this._collides(position.x, nextZ)) {
      position.z = nextZ;
    }
  }

  _collides(x, z) {
    return this.world.colliders.some((box) => overlapsCircleAabb(x, z, this.radius, box));
  }
}
