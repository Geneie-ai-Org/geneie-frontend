import React, { useEffect, useRef } from 'react';

const IsometricGenomicScene = () => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Animation state
    let time = 0;
    
    // Isometric projection helpers
    const isoX = (x, y) => (x - y) * 0.866;
    const isoY = (x, y) => (x + y) * 0.5 - z * 0.5;
    
    // Color palette
    const colors = {
      primary: '#2F7F7A',
      primaryLight: '#4ad6cd',
      primaryDark: '#256B67',
      accent: '#7B7481',
      white: '#FFFFFF',
      zinc100: '#f4f4f5',
      zinc200: '#e4e4e7',
      zinc300: '#d4d4d8',
      zinc400: '#a1a1aa',
      zinc500: '#71717a',
      zinc600: '#52525b',
      zinc700: '#3f3f46',
      zinc800: '#27272a',
      zinc900: '#18181b',
    };

    // Draw isometric box
    const drawIsoBox = (x, y, z, w, h, d, color, stroke = null) => {
      const cx = canvas.offsetWidth / 2 + x;
      const cy = canvas.offsetHeight / 2 + y;
      
      // Top face
      ctx.beginPath();
      ctx.moveTo(cx + isoX(x, y) - w * 0.866, cy + isoX(x, y) * 0.5 - z - h * 0.5);
      ctx.lineTo(cx + isoX(x + w, y) - w * 0.866, cy + isoX(x + w, y) * 0.5 - z - h * 0.5);
      ctx.lineTo(cx + isoX(x + w, y + d), cy + isoX(x + w, y + d) * 0.5 - z - h * 0.5);
      ctx.lineTo(cx + isoX(x, y + d), cy + isoX(x, y + d) * 0.5 - z - h * 0.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    // Draw DNA helix
    const drawDNAHelix = (centerX, centerY, height, amplitude) => {
      const points1 = [];
      const points2 = [];
      
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const y = centerY - height / 2 + t * height;
        const angle = t * Math.PI * 4 + time * 0.5;
        const x1 = centerX + Math.cos(angle) * amplitude;
        const x2 = centerX + Math.cos(angle + Math.PI) * amplitude;
        
        points1.push({ x: x1, y });
        points2.push({ x: x2, y });
      }
      
      // Draw strands
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      
      // Strand 1
      ctx.beginPath();
      ctx.moveTo(points1[0].x, points1[0].y);
      for (let i = 1; i < points1.length; i++) {
        ctx.lineTo(points1[i].x, points1[i].y);
      }
      ctx.strokeStyle = colors.primaryLight;
      ctx.stroke();
      
      // Strand 2
      ctx.beginPath();
      ctx.moveTo(points2[0].x, points2[0].y);
      for (let i = 1; i < points2.length; i++) {
        ctx.lineTo(points2[i].x, points2[i].y);
      }
      ctx.strokeStyle = colors.primary;
      ctx.stroke();
      
      // Draw rungs
      for (let i = 0; i < points1.length; i += 3) {
        ctx.beginPath();
        ctx.moveTo(points1[i].x, points1[i].y);
        ctx.lineTo(points2[i].x, points2[i].y);
        ctx.strokeStyle = colors.zinc400;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    // Draw floating particles
    const drawParticles = () => {
      for (let i = 0; i < 30; i++) {
        const x = (canvas.offsetWidth / 2) + Math.sin(time * 0.3 + i * 0.5) * (150 + i * 5);
        const y = (canvas.offsetHeight / 2) + Math.cos(time * 0.2 + i * 0.7) * (100 + i * 3);
        const size = 2 + Math.sin(time + i) * 1;
        const opacity = 0.3 + Math.sin(time * 0.5 + i) * 0.2;
        
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74, 214, 205, ${opacity})`;
        ctx.fill();
      }
    };

    // Draw isometric file icon
    const drawFileIcon = (x, y, size) => {
      const bounce = Math.sin(time * 2) * 5;
      const cy = y + bounce;
      
      // File body
      ctx.fillStyle = colors.zinc800;
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.moveTo(x - size / 2, cy - size / 2);
      ctx.lineTo(x + size / 4, cy - size / 2);
      ctx.lineTo(x + size / 2, cy - size / 4);
      ctx.lineTo(x + size / 2, cy + size / 2);
      ctx.lineTo(x - size / 2, cy + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Fold
      ctx.beginPath();
      ctx.moveTo(x + size / 4, cy - size / 2);
      ctx.lineTo(x + size / 4, cy - size / 4);
      ctx.lineTo(x + size / 2, cy - size / 4);
      ctx.strokeStyle = colors.primaryLight;
      ctx.stroke();
      
      // DNA text lines
      ctx.fillStyle = colors.zinc400;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - size / 3, cy - size / 6 + i * (size / 5), size * 0.5, 2);
      }
    };

    // Draw isometric chart/graph
    const drawChart = (x, y, width, height) => {
      const bounce = Math.sin(time * 1.5 + 1) * 3;
      const cy = y + bounce;
      
      // Base platform
      ctx.fillStyle = colors.zinc900;
      ctx.strokeStyle = colors.zinc700;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(x - width / 2, cy);
      ctx.lineTo(x + width / 2, cy);
      ctx.lineTo(x + width / 2, cy + height);
      ctx.lineTo(x - width / 2, cy + height);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Bars
      const barWidth = width / 6;
      const barHeights = [0.3, 0.5, 0.7, 0.9, 0.6, 0.8];
      
      barHeights.forEach((h, i) => {
        const barX = x - width / 2 + barWidth * i + barWidth / 2;
        const barH = height * h;
        const barY = cy + height - barH;
        
        const gradient = ctx.createLinearGradient(barX, barY, barX, cy + height);
        gradient.addColorStop(0, colors.primaryLight);
        gradient.addColorStop(1, colors.primary);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(barX - barWidth / 3, barY, barWidth * 0.6, barH);
      });
    };

    // Draw AI brain icon
    const drawBrain = (x, y, size) => {
      const pulse = Math.sin(time * 3) * 0.1 + 1;
      const s = size * pulse;
      
      // Glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, s);
      gradient.addColorStop(0, 'rgba(74, 214, 205, 0.3)');
      gradient.addColorStop(1, 'rgba(74, 214, 205, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
      
      // Brain circles
      ctx.fillStyle = colors.primary;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + time;
        const bx = x + Math.cos(angle) * s * 0.4;
        const by = y + Math.sin(angle) * s * 0.4;
        const r = s * 0.15;
        
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Center
      ctx.fillStyle = colors.primaryLight;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    };

    // Main render
    const render = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      
      // Background gradient
      const bgGradient = ctx.createRadialGradient(
        canvas.offsetWidth / 2, canvas.offsetHeight / 2, 0,
        canvas.offsetWidth / 2, canvas.offsetHeight / 2, canvas.offsetWidth * 0.7
      );
      bgGradient.addColorStop(0, '#18181b');
      bgGradient.addColorStop(1, '#09090b');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      
      // Draw particles
      drawParticles();
      
      // Draw DNA helix (center-left)
      drawDNAHelix(canvas.offsetWidth / 2 - 80, canvas.offsetHeight / 2, 250, 40);
      
      // Draw file icon (top-right)
      drawFileIcon(canvas.offsetWidth / 2 + 120, canvas.offsetHeight / 2 - 100, 60);
      
      // Draw chart (bottom-right)
      drawChart(canvas.offsetWidth / 2 + 100, canvas.offsetHeight / 2 + 50, 100, 80);
      
      // Draw AI brain (center)
      drawBrain(canvas.offsetWidth / 2, canvas.offsetHeight / 2 - 50, 50);
      
      // Draw connection lines
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.zinc600;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(canvas.offsetWidth / 2 - 40, canvas.offsetHeight / 2 - 50);
      ctx.lineTo(canvas.offsetWidth / 2 + 90, canvas.offsetHeight / 2 - 70);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(canvas.offsetWidth / 2, canvas.offsetHeight / 2);
      ctx.lineTo(canvas.offsetWidth / 2 + 100, canvas.offsetHeight / 2 + 50);
      ctx.stroke();
      
      ctx.setLineDash([]);
      
      time += 0.016;
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  );
};

export default IsometricGenomicScene;
