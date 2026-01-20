const canvasXZ = document.getElementById('canvasXZ');
const ctxXZ = canvasXZ.getContext('2d');
const canvasYZ = document.getElementById('canvasYZ');
const ctxYZ = canvasYZ.getContext('2d');

// Canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;

canvasXZ.width = CANVAS_WIDTH;
canvasXZ.height = CANVAS_HEIGHT;
canvasYZ.width = CANVAS_WIDTH;
canvasYZ.height = CANVAS_HEIGHT;

// View State
const viewState = {
    XZ: { scale: 2, offsetX: CANVAS_WIDTH / 2 + 100, offsetY: CANVAS_HEIGHT / 2, isDragging: false, lastX: 0, lastY: 0 },
    YZ: { scale: 2, offsetX: CANVAS_WIDTH / 2 + 100, offsetY: CANVAS_HEIGHT / 2, isDragging: false, lastX: 0, lastY: 0 }
};

function getInputs() {
    const angleVal = parseFloat(document.getElementById('lightAngle').value);
    const unit = document.getElementById('angleUnit').value;
    const angleRad = unit === 'deg' ? angleVal * (Math.PI / 180) : angleVal;

    return {
        resX: parseFloat(document.getElementById('resX').value),
        resY: parseFloat(document.getElementById('resY').value),
        pitch: parseFloat(document.getElementById('pitch').value) * 1e-3, // convert um to mm
        wavelength: parseFloat(document.getElementById('wavelength').value) * 1e-6, // convert nm to mm
        lightAngle: angleRad,
        objX: parseFloat(document.getElementById('objX').value),
        objY: parseFloat(document.getElementById('objY').value),
        objZ: parseFloat(document.getElementById('objZ').value),
        objMaxX: parseFloat(document.getElementById('objMaxX').value),
        objMaxY: parseFloat(document.getElementById('objMaxY').value),
        objMaxZ: parseFloat(document.getElementById('objMaxZ').value),
    };
}

function drawGridAndAxes(ctx, width, height, scale, originX, originY, vLabel) {
    ctx.strokeStyle = '#e0e0e0'; // Light gray grid
    ctx.lineWidth = 0.5;
    ctx.font = '10px Inter';
    ctx.fillStyle = '#666'; // Darker text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Dynamic Grid Step Calculation
    // We want roughly 10-20 grid lines visible on the screen.
    const visibleMm = width / scale;
    // Avoid division by zero or extremely small steps if scale is messed up
    if (visibleMm <= 0 || !isFinite(visibleMm)) return;

    // Reduce density: fewer lines. Divide by 4 instead of 10.
    const targetStepMm = visibleMm / 4;

    // Snap to "nice" numbers (1, 2, 5 * 10^k)
    const power = Math.floor(Math.log10(targetStepMm));
    const base = targetStepMm / Math.pow(10, power);
    let niceBase;
    if (base < 1.5) niceBase = 1;
    else if (base < 3.5) niceBase = 2;
    else if (base < 7.5) niceBase = 5;
    else niceBase = 10;

    const gridStepMm = niceBase * Math.pow(10, power);
    const gridStepPx = gridStepMm * scale;

    // Safety check to prevent infinite loops if gridStepPx is tiny
    if (gridStepPx < 2) return; // Don't draw if lines are too close

    // Draw vertical lines (Z steps)
    const startIdx = Math.floor(-originX / gridStepPx);
    const endIdx = Math.ceil((width - originX) / gridStepPx);

    // Batch lines for performance
    ctx.beginPath();
    for (let i = startIdx; i <= endIdx; i++) {
        const x = originX + i * gridStepPx;
        // Avoid drawing way off screen
        if (x < -10 || x > width + 10) continue;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    ctx.stroke();

    // Draw labels separately
    for (let i = startIdx; i <= endIdx; i++) {
        const x = originX + i * gridStepPx;
        if (x < -10 || x > width + 10) continue;
        if (i % 5 === 0 || gridStepPx > 50) { // Only draw text if space permits or significant index
            // Round to avoid floating point mess
            const val = Math.round(i * gridStepMm * 1000) / 1000;
            ctx.fillText(val.toString(), x, originY + 5);
        }
    }

    // Draw horizontal lines (Transverse steps)
    const iMax = Math.floor(originY / gridStepPx);
    const iMin = Math.ceil((originY - height) / gridStepPx);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    ctx.beginPath();
    for (let i = iMin; i <= iMax; i++) {
        const y = originY - i * gridStepPx;
        if (y < -10 || y > height + 10) continue;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Horizontal Labels
    for (let i = iMin; i <= iMax; i++) {
        const y = originY - i * gridStepPx;
        if (y < -10 || y > height + 10) continue;
        if (i % 5 === 0 || gridStepPx > 50) {
            const val = Math.round(i * gridStepMm * 1000) / 1000;
            ctx.fillText(val.toString(), originX - 5, y);
        }
    }

    // Main Axes
    ctx.strokeStyle = '#333'; // Dark axes
    ctx.lineWidth = 1.5;

    // Z Axis (Horizontal)
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();

    // Transverse Axis (Vertical)
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Axis Names
    ctx.fillStyle = '#333'; // Dark text
    ctx.font = '12px Inter';
    ctx.textAlign = 'right';
    ctx.fillText('Z (mm)', width - 10, originY - 10);

    ctx.textAlign = 'left';
    ctx.fillText(vLabel, originX + 10, 20);
}

function drawScene(ctx, plane, params) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const state = viewState[plane];
    const scale = state.scale;
    const originX = state.offsetX;
    const originY = state.offsetY;

    const vLabel = plane === 'XZ' ? 'X (mm)' : 'Y (mm)';
    drawGridAndAxes(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, scale, originX, originY, vLabel);

    // Helper to map world coordinates (z, transverse) to screen (x, y)
    const toScreen = (z, t) => {
        return {
            x: originX + z * scale,
            y: originY - t * scale
        };
    };

    // Helper: Get visible world bounds
    const getVisibleBounds = () => {
        const zMin = -originX / scale;
        const zMax = (CANVAS_WIDTH - originX) / scale;
        const tMax = originY / scale; // Screen Y=0 -> World T = originY/scale
        const tMin = (originY - CANVAS_HEIGHT) / scale;
        return { zMin, zMax, tMin, tMax };
    };

    const bounds = getVisibleBounds();
    // Expand bounds slightly for ray clipping so lines extend off-screen
    const buffer = (bounds.zMax - bounds.zMin) * 0.5; // 50% buffer
    const clipZMin = bounds.zMin - buffer;
    const clipZMax = bounds.zMax + buffer;
    const clipTMin = bounds.tMin - buffer; // Note: T and Y directions
    const clipTMax = bounds.tMax + buffer;

    // Helper: Clip line segment to bounds (Rough approximation for infinite rays)
    // Simply finds a point far enough in the direction
    const getFarPoint = (startZ, startT, angle) => {
        // Ray direction vector
        const dz = Math.cos(angle);
        const dt = Math.sin(angle);

        // We want to find a parameter 'k' such that (start + k*dir) is well outside the view.
        // We can just pick a large enough k relative to the view size.
        // View diagonal size approx:
        const viewSize = Math.max(clipZMax - clipZMin, clipTMax - clipTMin);
        const k = viewSize * 2; // Enough to cover screen

        return {
            z: startZ + dz * k,
            t: startT + dt * k
        };
    };

    // For diffraction rays (tan theta)
    const getFarPointFromTan = (startZ, startT, tanTheta) => {
        const theta = Math.atan(tanTheta);
        // Correct quadrant: Ray always goes +Z
        const dz = Math.cos(theta); // always positive for -PI/2 < theta < PI/2
        const dt = Math.sin(theta);

        const viewSize = Math.max(clipZMax - clipZMin, clipTMax - clipTMin);
        const k = viewSize * 2;

        return {
            z: startZ + dz * k,
            t: startT + dt * k
        };
    };


    // 1. Draw Hologram (at Z=0)
    const hologramWidth = (plane === 'XZ' ? params.resX : params.resY) * params.pitch;
    const hStart = toScreen(0, -hologramWidth / 2);
    const hEnd = toScreen(0, hologramWidth / 2);

    ctx.strokeStyle = '#e91e63'; // Pink
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hStart.x, hStart.y);
    ctx.lineTo(hEnd.x, hEnd.y);
    ctx.stroke();

    // 2. Draw Object (Green Rectangle)
    const objC = {
        z: params.objZ,
        t: plane === 'XZ' ? params.objX : params.objY
    };
    const objM = {
        z: params.objMaxZ,
        t: plane === 'XZ' ? params.objMaxX : params.objMaxY
    };

    // Calculate half-extents (absolute difference)
    const dZ = Math.abs(objM.z - objC.z);
    const dT = Math.abs(objM.t - objC.t);

    // Rectangle corners in World Coords
    const zMin = objC.z - dZ;
    const zMax = objC.z + dZ;
    const tMin = objC.t - dT;
    const tMax = objC.t + dT;

    // Convert to Screen Coords
    const p1 = toScreen(zMin, tMin);
    const p2 = toScreen(zMax, tMin);
    const p3 = toScreen(zMax, tMax);
    const p4 = toScreen(zMin, tMax);

    ctx.strokeStyle = '#2e7d32'; // Dark Green
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.stroke();

    // 2.1 Draw Connecting Lines (Object Corners to Hologram Edges)
    // "Top-Right" of box (Max Z, Max T) -> Hologram Top (0, +Width/2)
    // "Bottom-Right" of box (Max Z, Min T) -> Hologram Bottom (0, -Width/2)

    ctx.strokeStyle = '#9c27b0'; // Purple for specific geometry lines
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]); // Dotted

    const holoTop = toScreen(0, hologramWidth / 2);
    const holoBottom = toScreen(0, -hologramWidth / 2);

    // Object "Right" is zMax (assuming object is to the right of hologram). 
    // If object is at Z < 0, "Right" might mean something else, but strictly "Right" in +Z axis is zMax.
    // User asked for "box right-upper" (右上).

    // Top-Right Corner (zMax, tMax)
    // Top-Right Path: From (0, +W/2) through (zMax, tMax)
    let tanTop = 0;
    const hTopT = hologramWidth / 2;
    if (Math.abs(zMax) > 1e-6) {
        tanTop = (tMax - hTopT) / zMax;
    } else {
        tanTop = (tMax - hTopT) > 0 ? 1e6 : -1e6;
    }

    const startTop = toScreen(0, hTopT);
    const farTop = getFarPointFromTan(0, hTopT, tanTop);
    const endTop = toScreen(farTop.z, farTop.t);

    ctx.beginPath();
    ctx.moveTo(startTop.x, startTop.y);
    ctx.lineTo(endTop.x, endTop.y);
    ctx.stroke();

    // Bottom-Right Path: From (0, -W/2) through (zMax, tMin)
    let tanBottom = 0;
    const hBottomT = -hologramWidth / 2;
    if (Math.abs(zMax) > 1e-6) {
        tanBottom = (tMin - hBottomT) / zMax;
    } else {
        tanBottom = (tMin - hBottomT) > 0 ? 1e6 : -1e6;
    }

    const startBottom = toScreen(0, hBottomT);
    const farBottom = getFarPointFromTan(0, hBottomT, tanBottom);
    const endBottom = toScreen(farBottom.z, farBottom.t);

    ctx.beginPath();
    ctx.moveTo(startBottom.x, startBottom.y);
    ctx.lineTo(endBottom.x, endBottom.y);
    ctx.stroke();

    ctx.setLineDash([]); // Reset dash

    // 3. Draw Rays from Object (Blue/Gray)
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.3)'; // Blue rays
    ctx.lineWidth = 1;

    const targets = [0, -hologramWidth / 2, hologramWidth / 2];
    const centerPos = toScreen(objC.z, objC.t);

    targets.forEach(t => {
        const tPos = toScreen(0, t);
        ctx.beginPath();
        ctx.moveTo(centerPos.x, centerPos.y);
        ctx.lineTo(tPos.x, tPos.y);
        ctx.stroke();
    });

    // 4. Draw Parallel Light (Reference Beam) - Blue
    ctx.strokeStyle = '#2196f3'; // Blue
    ctx.lineWidth = 2;

    // Rays hitting the top and bottom of the hologram
    const lightTargets = [-hologramWidth / 2, hologramWidth / 2];

    // Store theta_ill for diffraction calc
    let theta_ill = 0;
    if (plane === 'YZ') {
        theta_ill = params.lightAngle;
    }

    const angle = theta_ill; // For parallel light visualization

    lightTargets.forEach(t => {
        // Direction is 'angle'
        // Ray goes through (0, t)
        // We need to draw a line segment long enough to cover the view.
        // Parametric: Z(k) = 0 + k * cos(angle), T(k) = t + k * sin(angle)
        // We want to find range [kMin, kMax] that covers visible area.
        // Instead of complex clipping, just draw from "very far back" to "very far forward" relative to view center.

        // Bounds Checking approx
        const viewSize = Math.max(clipZMax - clipZMin, clipTMax - clipTMin);
        const farDist = viewSize * 1.5;

        // Start point (far negative k)
        // Note: For parallel light, we just want a line through the point at angle.
        // k negative -> towards light source?
        // In YZ: angle 0.2 rad -> light comes from left/bottom?
        // Wait, current implementation:
        // startZ = 0 - rayLen * cos; endZ = 0 + rayLen * cos;
        // Direction vector (cos, sin).

        const dz = Math.cos(angle);
        // User requested: As Z increases, Y should decrease.
        // Currently angle=0.2 (positive). sin(angle) > 0.
        // If dt = sin(angle), then T increases with Z.
        // So we need dt = -sin(angle).
        const dt = plane === 'YZ' ? -Math.sin(angle) : Math.sin(angle);

        const startZ = 0 - farDist * dz;
        const startT = t - farDist * dt;

        const endZ = 0 + farDist * dz;
        const endT = t + farDist * dt;

        const startPos = toScreen(startZ, startT);
        const endPos = toScreen(endZ, endT);

        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endPos.x, endPos.y);
        ctx.stroke();
    });

    // 5. Draw Max Diffraction Angle Rays
    // theta_out = asin( lambda / 2p + sin(theta_ill) )
    const term = params.wavelength / (2 * params.pitch) + Math.sin(theta_ill);

    // Check if result is physical (within [-1, 1])
    if (Math.abs(term) <= 1.0) {
        // Base angle magnitude
        const theta_base = Math.asin(term);

        ctx.strokeStyle = '#ffd600'; // Yellow for max diffraction
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]); // Dashed line to distinguish

        const edges = [-hologramWidth / 2, hologramWidth / 2];

        edges.forEach(t => {
            // Identify if Top or Bottom edge
            // In our logical coordinates, +t is "Up" (Top of screen), -t is "Down" (Bottom of screen)

            // t > 0 is Top Edge.
            // t < 0 is Bottom Edge.
            // Previous: Top->(-), Bottom->(+)

            const theta_out = (t > 0) ? -theta_base : theta_base;

            const startZ = 0;
            const startT = t;

            // Clamped End Point
            const tanTheta = Math.tan(theta_out);
            const farPt = getFarPointFromTan(startZ, startT, tanTheta);

            const p1 = toScreen(startZ, startT);
            const p2 = toScreen(farPt.z, farPt.t);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });
        ctx.setLineDash([]); // Reset
    }
}

function fitView(params) {
    // Target: Hologram occupies 60% of canvas height
    const targetHeight = CANVAS_HEIGHT * 0.6;

    // Center Y position
    const centerY = CANVAS_HEIGHT / 2;

    // Z position: 20% from left (2:8 ratio)
    const offsetZ = CANVAS_WIDTH * 0.2;

    // XZ Plane
    const hologramWidthXZ = params.resX * params.pitch;
    // Prevent division by zero or negative
    if (hologramWidthXZ > 0) {
        const scaleXZ = targetHeight / hologramWidthXZ;
        viewState.XZ.scale = scaleXZ;
        viewState.XZ.offsetX = offsetZ;
        viewState.XZ.offsetY = centerY;
    }

    // YZ Plane
    const hologramWidthYZ = params.resY * params.pitch;
    if (hologramWidthYZ > 0) {
        const scaleYZ = targetHeight / hologramWidthYZ;
        viewState.YZ.scale = scaleYZ;
        viewState.YZ.offsetX = offsetZ;
        viewState.YZ.offsetY = centerY;
    }
}

// ... helper functions ...

let isRenderPending = false;
let needsFit = false;

function requestUpdate(fit = false) {
    if (fit) needsFit = true;
    if (!isRenderPending) {
        isRenderPending = true;
        requestAnimationFrame(renderLoop);
    }
}

function calculateIntersections(z, params, plane) {
    const hologramWidth = (plane === 'XZ' ? params.resX : params.resY) * params.pitch;

    // Bounds for rays
    // We are looking for lines t(z) = slope * z + intercept
    // We want to find smallest positive t and largest negative t at z.

    let rays = [];

    // Define theta_ill at the top level of the function
    let theta_ill = 0;
    if (plane === 'YZ') {
        theta_ill = params.lightAngle;
    }

    // 1. Parallel Light
    // User requested to exclude parallel light for XZ plane
    if (plane !== 'XZ') {
        const dz_ill = Math.cos(theta_ill);
        const dt_ill = plane === 'YZ' ? -Math.sin(theta_ill) : Math.sin(theta_ill);
        const slope_ill = dt_ill / dz_ill;

        // Parallel Top Ray: (0, W/2)
        rays.push({ slope: slope_ill, intercept: hologramWidth / 2 });
        // Parallel Bottom Ray: (0, -W/2)
        rays.push({ slope: slope_ill, intercept: -hologramWidth / 2 });
    }

    // 2. Standard Max Diffraction
    // theta_out = asin( lambda/2p + sin(theta_ill) )
    const term = params.wavelength / (2 * params.pitch) + Math.sin(theta_ill);

    if (Math.abs(term) <= 1.0) {
        const theta_base = Math.asin(term);
        // Slope calculation:
        // Top: dz = cos(-theta_base), dt = sin(-theta_base) -> slope = tan(-theta_base)
        // Bottom: dz = cos(theta_base), dt = sin(theta_base) -> slope = tan(theta_base)

        rays.push({ slope: Math.tan(-theta_base), intercept: hologramWidth / 2 });
        rays.push({ slope: Math.tan(theta_base), intercept: -hologramWidth / 2 });
    }

    // 3. Object-Aware Diffraction
    // The lines we added: Hologram Edge -> Object Box Corner -> Infinity
    // Top: (0, W/2) -> (objZ + dZ, objT + dT)
    // Bot: (0, -W/2) -> (objZ + dZ, objT - dT)

    // Calculate Object Bounds again
    const objC = { z: params.objZ, t: plane === 'XZ' ? params.objX : params.objY };
    const objM = { z: params.objMaxZ, t: plane === 'XZ' ? params.objMaxX : params.objMaxY };
    const dZ = Math.abs(objM.z - objC.z);
    const dT = Math.abs(objM.t - objC.t);
    const zMax = objC.z + dZ; // This is the "Right" side in our Z-is-Right view
    const tMax = objC.t + dT;
    const tMin = objC.t - dT;

    // Top Ray Slope
    const hTopT = hologramWidth / 2;
    let slopeTop = 0;
    if (Math.abs(zMax) > 1e-6) {
        slopeTop = (tMax - hTopT) / zMax; // intercept is hTopT at z=0
    } else {
        slopeTop = (tMax - hTopT) > 0 ? 1e6 : -1e6;
    }
    rays.push({ slope: slopeTop, intercept: hTopT });

    // Bottom Ray Slope
    const hBottomT = -hologramWidth / 2;
    let slopeBot = 0;
    if (Math.abs(zMax) > 1e-6) {
        slopeBot = (tMin - hBottomT) / zMax;
    } else {
        slopeBot = (tMin - hBottomT) > 0 ? 1e6 : -1e6;
    }
    rays.push({ slope: slopeBot, intercept: hBottomT });

    // --- Find Intersections at Z ---
    let distPlus = Infinity;
    let distMinus = -Infinity; // Looking for max negative (closest to 0 from below)

    rays.forEach(ray => {
        const t = ray.slope * z + ray.intercept;
        if (t > 0) {
            if (t < distPlus) distPlus = t;
        } else if (t < 0) {
            if (t > distMinus) distMinus = t;
        } else {
            // t == 0, hit exactly on axis
            distPlus = 0;
            distMinus = 0;
        }
    });

    if (distMinus === -Infinity) distMinus = Infinity; // No negative rays found

    return { distPlus, distMinus };
}

function renderLoop() {
    isRenderPending = false;

    const params = getInputs();

    try {
        // Safety Check Calculation
        const zView = parseFloat(document.getElementById('viewZ').value);
        const safetyXZ = calculateIntersections(zView, params, 'XZ');
        const safetyYZ = calculateIntersections(zView, params, 'YZ');

        document.getElementById('safeXZ_Pos').textContent = safetyXZ.distPlus === Infinity ? 'Safe' : safetyXZ.distPlus.toFixed(2);
        document.getElementById('safeXZ_Neg').textContent = safetyXZ.distMinus === Infinity ? 'Safe' : Math.abs(safetyXZ.distMinus).toFixed(2);

        document.getElementById('safeYZ_Pos').textContent = safetyYZ.distPlus === Infinity ? 'Safe' : safetyYZ.distPlus.toFixed(2);
        document.getElementById('safeYZ_Neg').textContent = safetyYZ.distMinus === Infinity ? 'Safe' : Math.abs(safetyYZ.distMinus).toFixed(2);
    } catch (e) {
        console.error("Safety Calculation Error:", e);
        document.getElementById('safeXZ_Pos').textContent = "Err";
        document.getElementById('safeXZ_Neg').textContent = "Err";
        document.getElementById('safeYZ_Pos').textContent = "Err";
        document.getElementById('safeYZ_Neg').textContent = "Err";
    }

    if (needsFit) {
        fitView(params);
        needsFit = false;
    }
    drawScene(ctxXZ, 'XZ', params);
    drawScene(ctxYZ, 'YZ', params);
}

function update(shouldFit = false) {
    requestUpdate(shouldFit);
}

// Interaction Handlers
function setupInteraction(canvas, plane) {
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const state = viewState[plane];
        const zoomIntensity = 0.1;
        const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
        const newScale = state.scale * (1 + delta);

        // Zoom towards mouse pointer
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // (mouseX - offsetX) / scale = worldX
        // newOffsetX = mouseX - worldX * newScale
        const worldX = (mouseX - state.offsetX) / state.scale;
        const worldY = (mouseY - state.offsetY) / state.scale;

        state.offsetX = mouseX - worldX * newScale;
        state.offsetY = mouseY - worldY * newScale;
        state.scale = newScale;

        requestUpdate(false);
    }, { passive: false }); // Explicitly set passive: false to allow preventDefault

    canvas.addEventListener('mousedown', (e) => {
        const state = viewState[plane];
        state.isDragging = true;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        const state = viewState[plane];
        if (state.isDragging) {
            const dx = e.clientX - state.lastX;
            const dy = e.clientY - state.lastY;
            state.offsetX += dx;
            state.offsetY += dy;
            state.lastX = e.clientX;
            state.lastY = e.clientY;
            requestUpdate(false);
        }
    });

    window.addEventListener('mouseup', () => {
        viewState[plane].isDragging = false;
    });
}

setupInteraction(canvasXZ, 'XZ');
setupInteraction(canvasYZ, 'YZ');

document.getElementById('updateBtn').addEventListener('click', () => update(true));
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => update(false));
});

// Initial draw with fit
update(true);
