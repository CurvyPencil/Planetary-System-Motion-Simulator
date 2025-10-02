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
    const MAX_TABLE_ROWS = 12;

    // --- カラーパレット ---
    const PLANET_COLORS = ['#FF7F50', '#6A5ACD', '#00FA9A', '#FF69B4', '#1E90FF', '#FFD700', '#ADFF2F', '#F08080', '#BA55D3', '#7B68EE', '#3CB371', '#FFA07A'];

    // --- シミュレーション/UI設定 ---
    const simParams = { dt: 1 * 60 * 60, stepsPerFrame: 6, collisionRadiusMultiplier: 50, isRunning: true, isViewLocked: false, trailsVisible: true, };
    
    // --- DOM要素と状態変数 ---
    const canvas = document.getElementById('simulationCanvas'); const ctx = canvas.getContext('2d');
    let bodies = []; let activeEffects = []; let nextColorIndex = 0; let selectedBodyIndex = 0; let scale = 3.5e9; let offset = { x: 0, y: 0 }; let lastMousePos = { x: 0, y: 0 }; let isPanning = false;
    let tableRowElements = []; // ★DOM最適化用
    let previewBody = null; // ★プレビュー機能用

    // ... (Vector, CelestialBody, CollisionEffect, NBodySimulation クラスは変更なし) ...
    class Vector { constructor(x = 0, y = 0) { this.x = x; this.y = y; } add(v) { return new Vector(this.x + v.x, this.y + v.y); } sub(v) { return new Vector(this.x - v.x, this.y - v.y); } scale(s) { return new Vector(this.x * s, this.y * s); } norm() { return Math.sqrt(this.x * this.x + this.y * this.y); } }
    class CelestialBody { constructor(name, mass, pos, vel, color) { this.name = name; this.mass = mass; this.pos = pos; this.vel = vel; this.acc = new Vector(); this.color = color; this.path = [pos]; this.updateRadiusAndSize(); } updateRadiusAndSize() { const baseRadius = R_EARTH * Math.pow(this.mass / M_EARTH, 1 / 3.0); this.radius = baseRadius * simParams.collisionRadiusMultiplier; const logMass = Math.log10(this.mass); const logMoonMass = Math.log10(M_MOON); const logSunMass = Math.log10(M_SUN_ORIG * 10); this.size = MIN_BODY_SIZE + (MAX_BODY_SIZE - MIN_BODY_SIZE) * (logMass - logMoonMass) / (logSunMass - logMoonMass); this.size = Math.max(MIN_BODY_SIZE, this.size); } }
    class CollisionEffect { constructor(pos, delta_ke) { this.pos = pos; this.age = 0; this.max_age = 30; const log_energy = Math.log10(Math.max(1, delta_ke)); this.initialSize = Math.min(50, 5 + log_energy * 1.5); this.initialAlpha = Math.min(0.8, 0.1 + (log_energy - 25) * 0.05); this.is_active = this.initialAlpha > 0; } update() { this.age++; if (this.age > this.max_age) this.is_active = false; } draw() { if (!this.is_active) return; const currentAlpha = this.initialAlpha * (1 - this.age / this.max_age); const screenPos = worldToScreen(this.pos); ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, this.initialSize / 2, 0, 2 * Math.PI); ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`; ctx.fill(); } }
    class NBodySimulation { constructor() { this.timeElapsed = 0; } update(bodies) { const accelerations = this._calculateAccelerations(bodies); bodies.forEach((body, i) => { body.vel = body.vel.add(accelerations[i].scale(0.5 * simParams.dt)); body.pos = body.pos.add(body.vel.scale(simParams.dt)); }); const newAccelerations = this._calculateAccelerations(bodies); bodies.forEach((body, i) => { body.vel = body.vel.add(newAccelerations[i].scale(0.5 * simParams.dt)); body.acc = newAccelerations[i]; if (simParams.trailsVisible) { body.path.push(body.pos); if (body.path.length > MAX_PATH_LENGTH) body.path.shift(); } else { body.path = [body.pos]; } }); this.timeElapsed += simParams.dt; } _calculateAccelerations(bodies) { const accelerations = bodies.map(() => new Vector()); for (let i = 0; i < bodies.length; i++) { for (let j = 0; j < bodies.length; j++) { if (i === j) continue; const rVec = bodies[j].pos.sub(bodies[i].pos); const rNorm = rVec.norm(); if (rNorm > 1e6) { const forceMag = G * bodies[j].mass / Math.pow(rNorm, 3); accelerations[i] = accelerations[i].add(rVec.scale(forceMag)); } } } return accelerations; } handleCollisions(bodies) { let toRemove = new Set(); let toAddInfo = []; for (let i = 0; i < bodies.length; i++) { for (let j = i + 1; j < bodies.length; j++) { if (toRemove.has(i) || toRemove.has(j)) continue; const body1 = bodies[i], body2 = bodies[j]; if (body1.pos.sub(body2.pos).norm() < body1.radius + body2.radius) { const m1 = body1.mass, m2 = body2.mass; const v1 = body1.vel, v2 = body2.vel; const p1 = body1.pos, p2 = body2.pos; const keBefore = 0.5 * m1 * v1.norm() ** 2 + 0.5 * m2 * v2.norm() ** 2; const newMass = m1 + m2; const newVel = v1.scale(m1).add(v2.scale(m2)).scale(1 / newMass); const newPos = p1.scale(m1).add(p2.scale(m2)).scale(1 / newMass); const keAfter = 0.5 * newMass * newVel.norm() ** 2; const deltaKE = keBefore - keAfter; const [baseBody, otherName] = (m1 >= m2) ? [body1, body2.name] : [body2, body1.name]; let newName = baseBody.name; if (newName.startsWith("Super ")) {} else if (newName.startsWith("Giant ")) { newName = "Super " + newName.substring(6); } else { newName = "Giant " + newName; } const newBody = new CelestialBody(newName, newMass, newPos, newVel, baseBody.color); toAddInfo.push({ 'body': newBody, 'delta_ke': deltaKE }); toRemove.add(i); toRemove.add(j); } } } return { toRemove: Array.from(toRemove).sort((a, b) => b - a), toAddInfo }; } }
    const simulation = new NBodySimulation();

    function resetSimulation() { simParams.isRunning = true; document.getElementById('pauseButton').textContent = 'Pause'; const sun = new CelestialBody('Sun', M_SUN_ORIG, new Vector(0, 0), new Vector(0, 0), '#FFD700'); const earth = new CelestialBody('Earth', M_EARTH, new Vector(AU, 0), new Vector(0, 29780), '#1E90FF'); const moon = new CelestialBody('Moon', M_MOON, earth.pos.add(new Vector(3.844e8, 0)), earth.vel.add(new Vector(0, 1022)), '#A9A9A9'); bodies = [sun, earth, moon]; activeEffects = []; nextColorIndex = 0; selectedBodyIndex = 0; simulation.timeElapsed = 0; previewBody = null; document.getElementById('trailsButton').textContent = 'Trails ON'; simParams.trailsVisible = true; }
    function init() { buildTable(); resizeCanvas(); setupEventListeners(); resetSimulation(); requestAnimationFrame(animate); }
    function resizeCanvas() { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; offset = { x: canvas.width / 2, y: canvas.height / 2 }; }
    function worldToScreen({ x, y }) { return { x: x / scale + offset.x, y: y / scale + offset.y }; }
    function screenToWorld({ x, y }) { return { x: (x - offset.x) * scale, y: (y - offset.y) * scale }; }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (simParams.isViewLocked && bodies[selectedBodyIndex]) { const selectedPos = worldToScreen(bodies[selectedBodyIndex].pos); offset.x += (canvas.width / 2 - selectedPos.x); offset.y += (canvas.height / 2 - selectedPos.y); }
        
        // ★プレビュー軌道の描画
        if (previewBody) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
            const startPoint = worldToScreen(previewBody.path[0]); ctx.moveTo(startPoint.x, startPoint.y);
            for (let i = 1; i < previewBody.path.length; i++) { const point = worldToScreen(previewBody.path[i]); ctx.lineTo(point.x, point.y); }
            ctx.stroke(); ctx.setLineDash([]);
        }

        bodies.forEach((body, index) => {
            if (simParams.trailsVisible && body.path.length > 1) { ctx.beginPath(); ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)'; ctx.lineWidth = 1; const startPoint = worldToScreen(body.path[0]); ctx.moveTo(startPoint.x, startPoint.y); for (let i = 1; i < body.path.length; i++) { const point = worldToScreen(body.path[i]); ctx.lineTo(point.x, point.y); } ctx.stroke(); }
            const screenPos = worldToScreen(body.pos);
            ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, body.size / 2, 0, 2 * Math.PI); ctx.fillStyle = body.color; ctx.fill();
            if (index === selectedBodyIndex) { ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.stroke(); }
        });

        // ★プレビュー本体の描画
        if (previewBody) {
            const screenPos = worldToScreen(previewBody.pos);
            ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, previewBody.size / 2, 0, 2 * Math.PI); ctx.fillStyle = previewBody.color; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1.0;
        }

        activeEffects.forEach(effect => effect.draw());
    }
    
    // ★DOM最適化: テーブルの行を最初に生成
    function buildTable() {
        const tableBody = document.querySelector('#starTable tbody');
        for (let i = 0; i < MAX_TABLE_ROWS; i++) {
            const row = document.createElement('tr');
            const name = document.createElement('td');
            const mass = document.createElement('td');
            const speed = document.createElement('td');
            const select = document.createElement('td');
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'starSelect'; radio.dataset.index = i;
            select.appendChild(radio);
            row.appendChild(name); row.appendChild(mass); row.appendChild(speed); row.appendChild(select);
            tableBody.appendChild(row);
            tableRowElements.push({ row, name, mass, speed, radio });
        }
    }

    // ★DOM最適化: innerHTMLを使わずtextContentで更新
    function updateUI() {
        document.getElementById('time-display').textContent = `Day: ${(simulation.timeElapsed / (24 * 60 * 60)).toFixed(2)}`;
        for (let i = 0; i < MAX_TABLE_ROWS; i++) {
            const rowElements = tableRowElements[i];
            if (i < bodies.length) {
                const body = bodies[i];
                rowElements.row.style.display = '';
                let name = body.name; if (name.length > 12) name = name.substring(0, 10) + '...';
                rowElements.name.textContent = name;
                rowElements.mass.textContent = (body.mass / M_EARTH).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                rowElements.speed.textContent = (body.vel.norm() / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                rowElements.radio.checked = (i === selectedBodyIndex);
                if (i === selectedBodyIndex) { rowElements.row.classList.add('selected'); }
                else { rowElements.row.classList.remove('selected'); }
            } else {
                rowElements.row.style.display = 'none';
            }
        }
    }

    function animate() { if (simParams.isRunning) { for (let i = 0; i < simParams.stepsPerFrame; i++) { simulation.update(bodies); const { toRemove, toAddInfo } = simulation.handleCollisions(bodies); if (toRemove.length > 0) { bodies = bodies.filter((_, index) => !toRemove.includes(index)); toAddInfo.forEach(info => { bodies.push(info.body); activeEffects.push(new CollisionEffect(info.body.pos, info.delta_ke)); }); if (toRemove.includes(selectedBodyIndex)) selectedBodyIndex = 0; } } } activeEffects = activeEffects.filter(effect => { effect.update(); return effect.is_active; }); draw(); updateUI(); requestAnimationFrame(animate); }
    
    function logslider(position, min, max) { const minv = Math.log(min); const maxv = Math.log(max); const scale = (maxv - minv) / 1000; return Math.exp(minv + scale * position); }

    // ★プレビュー機能の本体
    function updatePreview() {
        const centerBody = bodies[selectedBodyIndex];
        if (!centerBody) return;
        const unit = document.querySelector('input[name="massUnit"]:checked').value; const unitMap = { 'Earths': M_EARTH, 'Suns': M_SUN_ORIG, 'Moons': M_MOON };
        const m_new = parseFloat(document.getElementById('massSlider').value) * unitMap[unit];
        const periodVal = logslider(document.getElementById('periodSlider').value, 0.1, 20.0); const T = periodVal * YEAR;
        const a = Math.pow(G * (centerBody.mass + m_new) * T * T / (4 * Math.PI * Math.PI), 1 / 3.0);
        const eccentricity = parseFloat(document.getElementById('eccSlider').value);
        const r_p = a * (1 - eccentricity); const v_p = Math.sqrt(G * (centerBody.mass + m_new) * (2 / r_p - 1 / a));
        const newPos = centerBody.pos.add(new Vector(r_p, 0)); const newVel = centerBody.vel.add(new Vector(0, v_p));
        const color = PLANET_COLORS[nextColorIndex % PLANET_COLORS.length];
        
        previewBody = new CelestialBody(`(preview)`, m_new, newPos, newVel, color);
        
        // 軌道計算
        let tempPos = newPos; let tempVel = newVel;
        let path = [tempPos];
        const numSteps = Math.floor(T / simParams.dt);
        for(let i=0; i < numSteps; i++){
            const rVec = centerBody.pos.sub(tempPos);
            const rNorm = rVec.norm();
            const acc = rVec.scale(G * centerBody.mass / Math.pow(rNorm, 3));
            tempVel = tempVel.add(acc.scale(simParams.dt));
            tempPos = tempPos.add(tempVel.scale(simParams.dt));
            path.push(tempPos);
        }
        previewBody.path = path;
    }

    function setupEventListeners() {
        window.addEventListener('resize', resizeCanvas);
        canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { isPanning = true; lastMousePos = { x: e.clientX, y: e.clientY }; } });
        canvas.addEventListener('mouseup', (e) => { if (e.button === 0) { isPanning = false; } });
        canvas.addEventListener('mouseleave', () => { isPanning = false; });
        canvas.addEventListener('mousemove', (e) => { if (isPanning) { const dx = e.clientX - lastMousePos.x, dy = e.clientY - lastMousePos.y; offset.x += dx; offset.y += dy; lastMousePos = { x: e.clientX, y: e.clientY }; } });
        
        // ★マウス中心ズームの実装
        canvas.addEventListener('wheel', (e) => { 
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const worldPosBefore = screenToWorld(mousePos);
            const scaleFactor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
            scale *= scaleFactor;
            const worldPosAfter = screenToWorld(mousePos);
            offset.x += (worldPosAfter.x - worldPosBefore.x) / scale;
            offset.y += (worldPosAfter.y - worldPosBefore.y) / scale;
        });

        canvas.addEventListener('click', (e) => { if (Math.sqrt(Math.pow(e.clientX - lastMousePos.x, 2) + Math.pow(e.clientY - lastMousePos.y, 2)) > 2) return; const rect = canvas.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; for (let i = 0; i < bodies.length; i++) { const body = bodies[i]; const screenPos = worldToScreen(body.pos); const distance = Math.sqrt(Math.pow(mouseX - screenPos.x, 2) + Math.pow(mouseY - screenPos.y, 2)); if (distance < body.size / 2) { selectedBodyIndex = i; previewBody = null; break; } } });
        document.querySelector('#starTable tbody').addEventListener('change', (e) => { if (e.target.name === 'starSelect' && e.target.dataset.index) { selectedBodyIndex = parseInt(e.target.dataset.index); previewBody = null; }});
        
        // --- コントロールUI ---
        const controlsToUpdatePreview = ['massSlider', 'eccSlider', 'periodSlider'];
        controlsToUpdatePreview.forEach(id => {
            document.getElementById(id).addEventListener('input', updatePreview);
        });
        document.querySelectorAll('input[name="massUnit"]').forEach(radio => {
            radio.addEventListener('change', (e) => { document.getElementById('massUnitLabel').textContent = e.target.value; updatePreview(); });
        });
        
        const periodSlider = document.getElementById('periodSlider');
        periodSlider.addEventListener('input', () => { document.getElementById('periodValue').textContent = logslider(periodSlider.value, 0.1, 20.0).toFixed(2); });
        document.getElementById('massSlider').addEventListener('input', (e) => { document.getElementById('massValue').textContent = parseFloat(e.target.value).toFixed(1); });
        document.getElementById('eccSlider').addEventListener('input', (e) => { document.getElementById('eccValue').textContent = parseFloat(e.target.value).toFixed(1); });
        document.getElementById('speedSlider').addEventListener('input', (e) => { simParams.stepsPerFrame = parseInt(e.target.value); document.getElementById('speedValue').textContent = e.target.value; });
        document.getElementById('pauseButton').addEventListener('click', () => { simParams.isRunning = !simParams.isRunning; document.getElementById('pauseButton').textContent = simParams.isRunning ? 'Pause' : 'Play'; });
        document.getElementById('lockViewButton').addEventListener('click', () => { simParams.isViewLocked = !simParams.isViewLocked; document.getElementById('lockViewButton').textContent = simParams.isViewLocked ? 'Unlock View' : 'Lock View'; });
        document.getElementById('resetButton').addEventListener('click', resetSimulation);
        document.getElementById('trailsButton').addEventListener('click', () => { simParams.trailsVisible = !simParams.trailsVisible; document.getElementById('trailsButton').textContent = simParams.trailsVisible ? 'Trails ON' : 'Trails OFF'; if (!simParams.trailsVisible) { bodies.forEach(body => body.path = [body.pos]); } });
        
        document.getElementById('addPlanetButton').addEventListener('click', () => {
            if (!previewBody) { alert("Please change a parameter to generate a preview first."); return; }
            if (bodies.length >= 12) { alert("Cannot add more bodies. Table is full."); return; }
            
            const newBody = previewBody; // プレビューを正式な天体に
            newBody.name = `Planet-${bodies.length + 1}`;
            bodies.push(newBody);
            previewBody = null; // プレビューをクリア
        });
    }

    init();
});