window.addEventListener('DOMContentLoaded', () => {
    // --- 定数 ---
    const G = 6.67430e-11;
    const M_SUN_ORIG = 1.989e30;
    const M_EARTH = 5.972e24;
    const M_MOON = 7.342e22;
    const R_EARTH = 6.371e6;
    const AU = 1.496e11;
    const YEAR = 365.25 * 24 * 60 * 60;
    const MAX_PATH_LENGTH = 2000;

    // --- 表示設定 ---
    const MIN_BODY_SIZE = 2; const MAX_BODY_SIZE = 25;
    // ★変更点: MAX_TABLE_ROWS を削除
    // const MAX_TABLE_ROWS = 12;

    // --- カラーパレット ---
    const PLANET_COLORS = ['#FF7F50', '#6A5ACD', '#00FA9A', '#FF69B4', '#1E90FF', '#FFD700', '#ADFF2F', '#F08080', '#BA55D3', '#7B68EE', '#3CB371', '#FFA07A'];

    // --- シミュレーション/UI設定 ---
    const simParams = { dt: 1 * 60 * 60, stepsPerFrame: 6, collisionRadiusMultiplier: 50, isRunning: true, isViewLocked: false, trailsVisible: true, };
    
    // --- DOM要素と状態変数 ---
    const canvas = document.getElementById('simulationCanvas'); const ctx = canvas.getContext('2d');
    let bodies = []; let activeEffects = []; let nextColorIndex = 0; let selectedBodyIndex = 0; let scale = 3.5e9; let offset = { x: 0, y: 0 }; let lastMousePos = { x: 0, y: 0 }; let isPanning = false;
    let previewBody = null; 
    // ★変更点: tableRowElements を削除
    // let tableRowElements = []; 

    // (Vector, CelestialBody, CollisionEffect, NBodySimulation クラスは変更なし)
    class Vector { constructor(x = 0, y = 0) { this.x = x; this.y = y; } add(v) { return new Vector(this.x + v.x, this.y + v.y); } sub(v) { return new Vector(this.x - v.x, this.y - v.y); } scale(s) { return new Vector(this.x * s, this.y * s); } norm() { return Math.sqrt(this.x * this.x + this.y * this.y); } }
    class CelestialBody { constructor(name, mass, pos, vel, color) { this.name = name; this.mass = mass; this.pos = pos; this.vel = vel; this.acc = new Vector(); this.color = color; this.path = [pos]; this.updateRadiusAndSize(); } updateRadiusAndSize() { const baseRadius = R_EARTH * Math.pow(this.mass / M_EARTH, 1 / 3.0); this.radius = baseRadius * simParams.collisionRadiusMultiplier; const logMass = Math.log10(this.mass); const logMoonMass = Math.log10(M_MOON); const logSunMass = Math.log10(M_SUN_ORIG * 10); this.size = MIN_BODY_SIZE + (MAX_BODY_SIZE - MIN_BODY_SIZE) * (logMass - logMoonMass) / (logSunMass - logMoonMass); this.size = Math.max(MIN_BODY_SIZE, this.size); } }
    class CollisionEffect { constructor(pos, delta_ke) { this.pos = pos; this.age = 0; this.max_age = 30; const log_energy = Math.log10(Math.max(1, delta_ke)); this.initialSize = Math.min(50, 5 + log_energy * 1.5); this.initialAlpha = Math.min(0.8, 0.1 + (log_energy - 25) * 0.05); this.is_active = this.initialAlpha > 0; } update() { this.age++; if (this.age > this.max_age) this.is_active = false; } draw() { if (!this.is_active) return; const currentAlpha = this.initialAlpha * (1 - this.age / this.max_age); const screenPos = worldToScreen(this.pos); ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, this.initialSize / 2, 0, 2 * Math.PI); ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`; ctx.fill(); } }
    class NBodySimulation { constructor() { this.timeElapsed = 0; } update(bodies) { const accelerations = this._calculateAccelerations(bodies); bodies.forEach((body, i) => { body.vel = body.vel.add(accelerations[i].scale(0.5 * simParams.dt)); body.pos = body.pos.add(body.vel.scale(simParams.dt)); }); const newAccelerations = this._calculateAccelerations(bodies); bodies.forEach((body, i) => { body.vel = body.vel.add(newAccelerations[i].scale(0.5 * simParams.dt)); body.acc = newAccelerations[i]; if (simParams.trailsVisible) { body.path.push(body.pos); if (body.path.length > MAX_PATH_LENGTH) body.path.shift(); } else { body.path = [body.pos]; } }); this.timeElapsed += simParams.dt; } _calculateAccelerations(bodies) { const accelerations = bodies.map(() => new Vector()); for (let i = 0; i < bodies.length; i++) { for (let j = i + 1; j < bodies.length; j++) { const body1 = bodies[i]; const body2 = bodies[j]; const rVec = body2.pos.sub(body1.pos); const rNorm = rVec.norm(); if (rNorm > 1e6) { const forceFactor = G / Math.pow(rNorm, 3); const acc1 = rVec.scale(body2.mass * forceFactor); accelerations[i] = accelerations[i].add(acc1); const acc2 = rVec.scale(-body1.mass * forceFactor); accelerations[j] = accelerations[j].add(acc2); } } } return accelerations; } handleCollisions(bodies) { let toRemove = new Set(); let toAddInfo = []; for (let i = 0; i < bodies.length; i++) { for (let j = i + 1; j < bodies.length; j++) { if (toRemove.has(i) || toRemove.has(j)) continue; const body1 = bodies[i], body2 = bodies[j]; if (body1.pos.sub(body2.pos).norm() < body1.radius + body2.radius) { const m1 = body1.mass, m2 = body2.mass; const v1 = body1.vel, v2 = body2.vel; const p1 = body1.pos, p2 = body2.pos; const keBefore = 0.5 * m1 * v1.norm() ** 2 + 0.5 * m2 * v2.norm() ** 2; const newMass = m1 + m2; const newVel = v1.scale(m1).add(v2.scale(m2)).scale(1 / newMass); const newPos = p1.scale(m1).add(p2.scale(m2)).scale(1 / newMass); const keAfter = 0.5 * newMass * newVel.norm() ** 2; const deltaKE = keBefore - keAfter; const [baseBody, otherName] = (m1 >= m2) ? [body1, body2.name] : [body2, body1.name]; let newName = baseBody.name; if (newName.startsWith("Super ")) {} else if (newName.startsWith("Giant ")) { newName = "Super " + newName.substring(6); } else { newName = "Giant " + newName; } const newBody = new CelestialBody(newName, newMass, newPos, newVel, baseBody.color); toAddInfo.push({ 'body': newBody, 'delta_ke': deltaKE }); toRemove.add(i); toRemove.add(j); } } } return { toRemove: Array.from(toRemove).sort((a, b) => b - a), toAddInfo }; } }
    const simulation = new NBodySimulation();

    function resetSimulation() { simParams.isRunning = true; document.getElementById('pauseButton').textContent = 'Pause'; const sun = new CelestialBody('Sun', M_SUN_ORIG, new Vector(0, 0), new Vector(0, 0), '#FFD700'); const planetsData = [ { name: 'Mercury', mass: 3.3011e23, period: 0.241, eccentricity: 0.2056, color: '#A9A9A9' }, { name: 'Venus', mass: 4.8675e24, period: 0.615, eccentricity: 0.0068, color: '#F4A460' }, { name: 'Earth', mass: 5.9724e24, period: 1.0, eccentricity: 0.0167, color: '#1E90FF' }, { name: 'Mars', mass: 6.4171e23, period: 1.881, eccentricity: 0.0934, color: '#FF4500' }, { name: 'Jupiter', mass: 1.8982e27, period: 11.86, eccentricity: 0.0488, color: '#D2B48C' }, { name: 'Saturn', mass: 5.6834e26, period: 29.45, eccentricity: 0.0557, color: '#F0E68C' }, { name: 'Uranus', mass: 8.6810e25, period: 84.02, eccentricity: 0.0472, color: '#ADD8E6' }, { name: 'Neptune', mass: 1.0241e26, period: 164.8, eccentricity: 0.0086, color: '#4682B4' }, ]; bodies = [sun]; planetsData.forEach(p_data => { const T = p_data.period * YEAR; const a = Math.pow(G * (sun.mass + p_data.mass) * T * T / (4 * Math.PI * Math.PI), 1 / 3.0); const r_p = a * (1 - p_data.eccentricity); const v_p = Math.sqrt(G * (sun.mass + p_data.mass) * (2 / r_p - 1 / a)); const newPos = new Vector(r_p, 0); const newVel = new Vector(0, v_p); const newBody = new CelestialBody(p_data.name, p_data.mass, newPos, newVel, p_data.color); bodies.push(newBody); }); activeEffects = []; nextColorIndex = 0; selectedBodyIndex = 0; simulation.timeElapsed = 0; document.getElementById('trailsButton').textContent = 'Trails ON'; simParams.trailsVisible = true; updatePreview(); }
    function init() { /* ★ buildTable()は削除 */ resizeCanvas(); setupEventListeners(); resetSimulation(); requestAnimationFrame(animate); }
    function resizeCanvas() { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; offset = { x: canvas.width / 2, y: canvas.height / 2 }; }
    function worldToScreen({ x, y }) { return { x: x / scale + offset.x, y: y / scale + offset.y }; }
    function screenToWorld({ x, y }) { return { x: (x - offset.x) * scale, y: (y - offset.y) * scale }; }
    function draw() { ctx.clearRect(0, 0, canvas.width, canvas.height); if (simParams.isViewLocked && bodies[selectedBodyIndex]) { const selectedPos = worldToScreen(bodies[selectedBodyIndex].pos); offset.x += (canvas.width / 2 - selectedPos.x); offset.y += (canvas.height / 2 - selectedPos.y); } if (previewBody) { ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); const startPoint = worldToScreen(previewBody.path[0]); ctx.moveTo(startPoint.x, startPoint.y); for (let i = 1; i < previewBody.path.length; i++) { const point = worldToScreen(previewBody.path[i]); ctx.lineTo(point.x, point.y); } ctx.stroke(); ctx.setLineDash([]); } bodies.forEach((body, index) => { if (simParams.trailsVisible && body.path.length > 1) { ctx.beginPath(); ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)'; ctx.lineWidth = 1; const startPoint = worldToScreen(body.path[0]); ctx.moveTo(startPoint.x, startPoint.y); for (let i = 1; i < body.path.length; i++) { const point = worldToScreen(body.path[i]); ctx.lineTo(point.x, point.y); } ctx.stroke(); } const screenPos = worldToScreen(body.pos); ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, body.size / 2, 0, 2 * Math.PI); ctx.fillStyle = body.color; ctx.fill(); if (index === selectedBodyIndex) { ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.stroke(); } }); if (previewBody) { const screenPos = worldToScreen(previewBody.pos); ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, previewBody.size / 2, 0, 2 * Math.PI); ctx.fillStyle = previewBody.color; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1.0; } activeEffects.forEach(effect => effect.draw()); }

    // ★変更点: buildTableを削除
    
    // ★変更点: updateUI を全面的に書き換え
    function updateUI() {
        document.getElementById('time-display').textContent = `Day: ${(simulation.timeElapsed / (24 * 60 * 60)).toFixed(2)}`;
        
        const tableBody = document.querySelector('#starTable tbody');
        
        // 行の数を bodies の数に同期させる
        while (tableBody.rows.length < bodies.length) {
            const row = tableBody.insertRow();
            row.insertCell(); // Name
            row.insertCell(); // Mass
            row.insertCell(); // Speed
            const selectCell = row.insertCell(); // Select
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'starSelect';
            selectCell.appendChild(radio);
        }
        while (tableBody.rows.length > bodies.length) {
            tableBody.deleteRow(-1);
        }
        
        // 各行の内容を更新
        bodies.forEach((body, index) => {
            const row = tableBody.rows[index];
            
            let name = body.name;
            if (name.length > 12) name = name.substring(0, 10) + '...';
            
            row.cells[0].textContent = name;
            row.cells[1].textContent = (body.mass / M_EARTH).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            row.cells[2].textContent = (body.vel.norm() / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            
            const radio = row.cells[3].firstChild;
            radio.checked = (index === selectedBodyIndex);
            radio.dataset.index = index;

            if (index === selectedBodyIndex) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
    }

    function animate() { if (simParams.isRunning) { for (let i = 0; i < simParams.stepsPerFrame; i++) { simulation.update(bodies); const { toRemove, toAddInfo } = simulation.handleCollisions(bodies); if (toRemove.length > 0) { bodies = bodies.filter((_, index) => !toRemove.includes(index)); toAddInfo.forEach(info => { bodies.push(info.body); activeEffects.push(new CollisionEffect(info.body.pos, info.delta_ke)); }); if (toRemove.includes(selectedBodyIndex)) { selectedBodyIndex = 0; updatePreview(); } } } } activeEffects = activeEffects.filter(effect => { effect.update(); return effect.is_active; }); draw(); updateUI(); requestAnimationFrame(animate); }
    function logslider(position, min, max) { const minv = Math.log(min); const maxv = Math.log(max); const scale = (maxv - minv) / 1000; return Math.exp(minv + scale * position); }
    function updatePreview() { const centerBody = bodies[selectedBodyIndex]; if (!centerBody) { previewBody = null; return; }; const unit = document.querySelector('input[name="massUnit"]:checked').value; const unitMap = { 'Earths': M_EARTH, 'Suns': M_SUN_ORIG, 'Moons': M_MOON }; const m_new = parseFloat(document.getElementById('massSlider').value) * unitMap[unit]; const periodVal = logslider(document.getElementById('periodSlider').value, 0.1, 20.0); const T = periodVal * YEAR; const a = Math.pow(G * (centerBody.mass + m_new) * T * T / (4 * Math.PI * Math.PI), 1 / 3.0); const eccentricity = parseFloat(document.getElementById('eccSlider').value); const r_p = a * (1 - eccentricity); const v_p = Math.sqrt(G * (centerBody.mass + m_new) * (2 / r_p - 1 / a)); const newPos = centerBody.pos.add(new Vector(r_p, 0)); const newVel = centerBody.vel.add(new Vector(0, v_p)); const color = PLANET_COLORS[nextColorIndex % PLANET_COLORS.length]; previewBody = new CelestialBody(`(preview)`, m_new, newPos, newVel, color); let path; if (simParams.isRunning) { const ghostBodies = bodies.map(b => new CelestialBody(b.name, b.mass, new Vector(b.pos.x, b.pos.y), new Vector(b.vel.x, b.vel.y), b.color)); ghostBodies.push(previewBody); const tempSim = new NBodySimulation(); path = [previewBody.pos]; const numSteps = Math.min(4000, Math.floor(T / simParams.dt)); for(let i=0; i < numSteps; i++){ const accelerations = tempSim._calculateAccelerations(ghostBodies); ghostBodies.forEach((body, j) => { body.vel = body.vel.add(accelerations[j].scale(0.5 * simParams.dt)); body.pos = body.pos.add(body.vel.scale(simParams.dt)); }); const newAccelerations = tempSim._calculateAccelerations(ghostBodies); ghostBodies.forEach((body, j) => { body.vel = body.vel.add(newAccelerations[j].scale(0.5 * simParams.dt)); }); path.push(ghostBodies[ghostBodies.length - 1].pos); } } else { path = []; const numSteps = 200; const c = a * eccentricity; const b = a * Math.sqrt(1 - eccentricity*eccentricity); for(let i=0; i <= numSteps; i++) { const angle = 2 * Math.PI * i / numSteps; const x = centerBody.pos.x + (a * Math.cos(angle) - c); const y = centerBody.pos.y + (b * Math.sin(angle)); path.push(new Vector(x, y)); } } previewBody.path = path; }
    function setupEventListeners() { window.addEventListener('resize', resizeCanvas); canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { isPanning = true; lastMousePos = { x: e.clientX, y: e.clientY }; } }); canvas.addEventListener('mouseup', (e) => { if (e.button === 0) { isPanning = false; } }); canvas.addEventListener('mouseleave', () => { isPanning = false; }); canvas.addEventListener('mousemove', (e) => { if (isPanning) { const dx = e.clientX - lastMousePos.x, dy = e.clientY - lastMousePos.y; offset.x += dx; offset.y += dy; lastMousePos = { x: e.clientX, y: e.clientY }; } }); canvas.addEventListener('wheel', (e) => { e.preventDefault(); const rect = canvas.getBoundingClientRect(); const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top }; const worldPosBefore = screenToWorld(mousePos); const scaleFactor = e.deltaY > 0 ? 1.1 : 1 / 1.1; scale *= scaleFactor; const worldPosAfter = screenToWorld(mousePos); offset.x += (worldPosAfter.x - worldPosBefore.x) / scale; offset.y += (worldPosAfter.y - worldPosBefore.y) / scale; }); canvas.addEventListener('click', (e) => { if (Math.sqrt(Math.pow(e.clientX - lastMousePos.x, 2) + Math.pow(e.clientY - lastMousePos.y, 2)) > 2) return; const rect = canvas.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; for (let i = 0; i < bodies.length; i++) { const body = bodies[i]; const screenPos = worldToScreen(body.pos); const distance = Math.sqrt(Math.pow(mouseX - screenPos.x, 2) + Math.pow(mouseY - screenPos.y, 2)); if (distance < body.size / 2) { if (selectedBodyIndex !== i) { selectedBodyIndex = i; updatePreview(); } break; } } }); document.querySelector('#starTable tbody').addEventListener('change', (e) => { if (e.target.name === 'starSelect' && e.target.dataset.index) { const newIndex = parseInt(e.target.dataset.index); if (selectedBodyIndex !== newIndex) { selectedBodyIndex = newIndex; updatePreview(); } } }); const controlsToUpdatePreview = ['massSlider', 'eccSlider', 'periodSlider']; controlsToUpdatePreview.forEach(id => { document.getElementById(id).addEventListener('input', updatePreview); }); document.querySelectorAll('input[name="massUnit"]').forEach(radio => { radio.addEventListener('change', (e) => { document.getElementById('massUnitLabel').textContent = e.target.value; updatePreview(); }); }); const periodSlider = document.getElementById('periodSlider'); periodSlider.addEventListener('input', () => { document.getElementById('periodValue').textContent = logslider(periodSlider.value, 0.1, 20.0).toFixed(2); }); document.getElementById('massSlider').addEventListener('input', (e) => { document.getElementById('massValue').textContent = parseFloat(e.target.value).toFixed(1); }); document.getElementById('eccSlider').addEventListener('input', (e) => { document.getElementById('eccValue').textContent = parseFloat(e.target.value).toFixed(1); }); document.getElementById('speedSlider').addEventListener('input', (e) => { simParams.stepsPerFrame = parseInt(e.target.value); document.getElementById('speedValue').textContent = e.target.value; }); document.getElementById('pauseButton').addEventListener('click', () => { simParams.isRunning = !simParams.isRunning; document.getElementById('pauseButton').textContent = simParams.isRunning ? 'Pause' : 'Play'; updatePreview(); }); document.getElementById('lockViewButton').addEventListener('click', () => { simParams.isViewLocked = !simParams.isViewLocked; document.getElementById('lockViewButton').textContent = simParams.isViewLocked ? 'Unlock View' : 'Lock View'; }); document.getElementById('resetButton').addEventListener('click', resetSimulation); document.getElementById('trailsButton').addEventListener('click', () => { simParams.trailsVisible = !simParams.trailsVisible; document.getElementById('trailsButton').textContent = simParams.trailsVisible ? 'Trails ON' : 'Trails OFF'; if (!simParams.trailsVisible) { bodies.forEach(body => body.path = [body.pos]); } });
        
        // ★変更点: Add Planetボタンの制限を解除
        document.getElementById('addPlanetButton').addEventListener('click', () => {
            if (!previewBody) { updatePreview(); }
            // if (bodies.length >= 12) { alert("Cannot add more bodies. Table is full."); return; } // 制限を削除
            const newBody = previewBody;
            newBody.name = `Planet-${nextColorIndex + 1}`;
            newBody.path = [newBody.pos]; 
            nextColorIndex++;
            bodies.push(newBody);
            previewBody = null;
            updatePreview();
        });
    }

    init();
});