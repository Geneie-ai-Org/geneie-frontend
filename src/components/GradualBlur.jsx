import { useMemo } from 'react';

const GradualBlur = ({
  position = 'top',
  height = '7rem',
  strength = 1.5,
  divCount = 5,
  curve = 'bezier',
  exponential = false,
  opacity = 1,
  fixed = false,
  offset = 0,
}) => {
  const blurLayers = useMemo(() => {
    return Array.from({ length: divCount }, (_, i) => {
      const progress = i / (divCount - 1);

      let blurAmount;
      if (curve === 'bezier') {
        // Bezier-like curve for smooth falloff
        blurAmount = exponential
          ? Math.pow(progress, 2) * strength * 10
          : progress * strength * 10;
      } else {
        blurAmount = progress * strength * 10;
      }

      const layerOpacity = exponential
        ? Math.pow(1 - progress, 0.5) * opacity
        : (1 - progress * 0.5) * opacity;

      return {
        blur: blurAmount,
        opacity: layerOpacity,
        zIndex: divCount - i,
      };
    });
  }, [divCount, strength, curve, exponential, opacity]);

  const positionStyles = position === 'top'
    ? { top: offset, left: 0, right: 0 }
    : { bottom: offset, left: 0, right: 0 };

  return (
    <div
      style={{
        position: fixed ? 'fixed' : 'absolute',
        ...positionStyles,
        height,
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {blurLayers.map((layer, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            inset: position === 'top' ? '-30px -30px 0 -30px' : '0 -30px -30px -30px',
            backdropFilter: `blur(${layer.blur}px)`,
            WebkitBackdropFilter: `blur(${layer.blur}px)`,
            opacity: layer.opacity,
            zIndex: layer.zIndex,
            maskImage: position === 'top'
              ? 'linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0))'
              : 'linear-gradient(to top, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0))',
            WebkitMaskImage: position === 'top'
              ? 'linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0))'
              : 'linear-gradient(to top, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0))',
          }}
        />
      ))}
    </div>
  );
};

export default GradualBlur;
