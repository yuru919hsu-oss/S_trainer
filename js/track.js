// S-Curve Track Definition and Collision Geometry
// 台灣駕訓班標準 S 型彎道 (曲線進退)

class SCurveTrack {
    constructor() {
        this.laneWidth = 3.8; // 車道寬度約 3.8 公尺 (考驗標準約 3.5~3.8m)
        this.sampleCount = 600;
        this.centerPoints = [];
        this.leftBorder = [];
        this.rightBorder = [];
        this.curbWidth = 0.3; // 安全島/黑管寬度
        this.generateTrack();
    }

    generateTrack() {
        // 建立 S 型彎道中心線
        // 入口直線 -> 弧度1 (向右彎) -> 弧度2 (反向向左彎) -> 出口直線
        const points = [];
        
        // 1. 起跑區直線 (長度 8m)
        for (let y = -8; y <= 0; y += 0.2) {
            points.push({ x: 0, z: y });
        }

        // 2. 第一個彎道 (向右彎，弧度半徑 R1 = 7.5m, 轉 110度)
        const R1 = 7.5;
        const startAngle1 = Math.PI; // 180度
        const sweep1 = - (110 * Math.PI / 180); // 向右彎
        const steps1 = 120;
        const center1 = { x: R1, z: 0 };
        for (let i = 1; i <= steps1; i++) {
            const angle = startAngle1 + (sweep1 * i / steps1);
            points.push({
                x: center1.x + R1 * Math.cos(angle),
                z: center1.z - R1 * Math.sin(angle)
            });
        }

        // 取得彎道1結束點與切線
        const endP1 = points[points.length - 1];
        const endAngle1 = startAngle1 + sweep1;
        const tangent1 = {
            x: -Math.sin(endAngle1),
            z: -Math.cos(endAngle1)
        };

        // 3. 第二個反向彎道 (向左彎，弧度半徑 R2 = 7.5m, 轉 110度)
        const R2 = 7.5;
        const normalToTangent = { x: -tangent1.z, z: tangent1.x };
        const center2 = {
            x: endP1.x - normalToTangent.x * R2,
            z: endP1.z - normalToTangent.z * R2
        };
        const startAngle2 = Math.atan2(endP1.z - center2.z, endP1.x - center2.x);
        const sweep2 = (110 * Math.PI / 180); // 向左彎
        const steps2 = 120;
        for (let i = 1; i <= steps2; i++) {
            const angle = startAngle2 + (sweep2 * i / steps2);
            points.push({
                x: center2.x + R2 * Math.cos(angle),
                z: center2.z + R2 * Math.sin(angle)
            });
        }

        // 4. 出口直線 (長度 8m)
        const endP2 = points[points.length - 1];
        const prevP = points[points.length - 2];
        const exitDir = {
            x: endP2.x - prevP.x,
            z: endP2.z - prevP.z
        };
        const len = Math.hypot(exitDir.x, exitDir.z);
        const exitNorm = { x: exitDir.x / len, z: exitDir.z / len };

        for (let d = 0.2; d <= 8; d += 0.2) {
            points.push({
                x: endP2.x + exitNorm.x * d,
                z: endP2.z + exitNorm.z * d
            });
        }

        this.centerPoints = points;
        this.computeBorders();
    }

    computeBorders() {
        const halfW = this.laneWidth / 2;
        this.leftBorder = [];
        this.rightBorder = [];

        for (let i = 0; i < this.centerPoints.length; i++) {
            let pNext = this.centerPoints[Math.min(i + 1, this.centerPoints.length - 1)];
            let pPrev = this.centerPoints[Math.max(i - 1, 0)];
            let dx = pNext.x - pPrev.x;
            let dz = pNext.z - pPrev.z;
            let len = Math.hypot(dx, dz) || 1;
            let nx = -dz / len;
            let nz = dx / len;

            let cur = this.centerPoints[i];
            this.leftBorder.push({
                x: cur.x + nx * halfW,
                z: cur.z + nz * halfW
            });
            this.rightBorder.push({
                x: cur.x - nx * halfW,
                z: cur.z - nz * halfW
            });
        }
    }

    checkTireCollision(tirePos) {
        let minLeftDist = Infinity;
        let minRightDist = Infinity;

        for (let i = 0; i < this.leftBorder.length - 1; i++) {
            let dist = this.distToSegment(tirePos, this.leftBorder[i], this.leftBorder[i + 1]);
            if (dist < minLeftDist) minLeftDist = dist;
        }

        for (let i = 0; i < this.rightBorder.length - 1; i++) {
            let dist = this.distToSegment(tirePos, this.rightBorder[i], this.rightBorder[i + 1]);
            if (dist < minRightDist) minRightDist = dist;
        }

        const hitThreshold = 0.15;
        const isColliding = (minLeftDist <= hitThreshold || minRightDist <= hitThreshold);

        return {
            isColliding: isColliding,
            pressedSide: minLeftDist <= hitThreshold ? 'left' : (minRightDist <= hitThreshold ? 'right' : null),
            minLeftDist: minLeftDist,
            minRightDist: minRightDist
        };
    }

    distToSegment(p, a, b) {
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let l2 = dx * dx + dz * dz;
        if (l2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
        let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
        t = Math.max(0, Math.min(1, t));
        let projX = a.x + t * dx;
        let projZ = a.z + t * dz;
        return Math.hypot(p.x - projX, p.z - projZ);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SCurveTrack;
}
