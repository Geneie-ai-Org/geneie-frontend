import { useEffect, useRef } from 'react';

const PixelBlast = ({
  variant = 'square',
  pixelSize = 3,
  color = '#B19EEF',
  patternScale = 2,
  patternDensity = 1,
  enableRipples = true,
  rippleSpeed = 0.3,
  rippleThickness = 0.1,
  rippleIntensityScale = 1,
  speed = 0.5,
  transparent = true,
  edgeFade = 0.5,
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    const resize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener('resize', resize);

    // Convert hex to RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 177, g: 158, b: 239 };
    };

    const rgb = hexToRgb(color);

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Apply edge fade gradient
      if (edgeFade > 0) {
        const gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.7
        );
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${1 - edgeFade})`);
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
      }

      // Draw pixel grid
      const spacing = pixelSize * patternScale;
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * spacing;
          const y = row * spacing;

          // Calculate distance from center for ripple effect
          const dx = x - width / 2;
          const dy = y - height / 2;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const maxDistance = Math.sqrt(
            (width / 2) * (width / 2) + (height / 2) * (height / 2)
          );
          const normalizedDistance = distance / maxDistance;

          // Ripple effect
          let opacity = patternDensity;
          if (enableRipples) {
            const ripple = Math.sin(
              distance * rippleThickness * 0.1 - timeRef.current * rippleSpeed
            );
            opacity *= (ripple + 1) * 0.5 * rippleIntensityScale;
          }

          // Time-based animation
          const timeOffset = Math.sin(timeRef.current * speed * 0.5 + col * 0.1 + row * 0.1);
          opacity *= 0.5 + timeOffset * 0.5;

          // Edge fade
          if (edgeFade > 0) {
            const edgeFactor = 1 - normalizedDistance * edgeFade;
            opacity *= Math.max(0, edgeFactor);
          }

          // Draw pixel
          if (opacity > 0.05) {
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.6})`;
            
            if (variant === 'square') {
              ctx.fillRect(x, y, pixelSize, pixelSize);
            } else if (variant === 'circle') {
              ctx.beginPath();
              ctx.arc(x + pixelSize / 2, y + pixelSize / 2, pixelSize / 2, 0, Math.PI * 2);
              ctx.fill();
            } else if (variant === 'diamond') {
              ctx.save();
              ctx.translate(x + pixelSize / 2, y + pixelSize / 2);
              ctx.rotate(Math.PI / 4);
              ctx.fillRect(-pixelSize / 2, -pixelSize / 2, pixelSize, pixelSize);
              ctx.restore();
            }
          }
        }
      }

      timeRef.current += 0.016;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    variant,
    pixelSize,
    color,
    patternScale,
    patternDensity,
    enableRipples,
    rippleSpeed,
    rippleThickness,
    rippleIntensityScale,
    speed,
    transparent,
    edgeFade,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
};

export default PixelBlast;
