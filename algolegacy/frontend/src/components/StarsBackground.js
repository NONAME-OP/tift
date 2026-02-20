import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

export const StarsBackground = ({
  starDensity = 0.00015,
  allStarsTwinkle = true,
  twinkleProbability = 0.7,
  minTwinkleSpeed = 0.5,
  maxTwinkleSpeed = 1,
  className = "",
}) => {
  const [stars, setStars] = useState([]);
  const containerRef = useRef(null);

  const generateStars = useCallback(
    (width, height) => {
      const area = width * height;
      const numStars = Math.floor(area * starDensity);
      return Array.from({ length: numStars }, () => {
        const shouldTwinkle =
          allStarsTwinkle || Math.random() < twinkleProbability;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 0.05 + 0.5,
          opacity: Math.random() * 0.5 + 0.5,
          twinkleSpeed: shouldTwinkle
            ? minTwinkleSpeed +
              Math.random() * (maxTwinkleSpeed - minTwinkleSpeed)
            : null,
        };
      });
    },
    [starDensity, allStarsTwinkle, twinkleProbability, minTwinkleSpeed, maxTwinkleSpeed]
  );

  useEffect(() => {
    const updateStars = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setStars(generateStars(width, height));
      }
    };

    updateStars();

    const resizeObserver = new ResizeObserver(updateStars);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [generateStars]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <svg
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
        }}
      >
        {stars.map((star, index) => (
          <StarDot key={index} star={star} />
        ))}
      </svg>
    </div>
  );
};

const StarDot = React.memo(({ star }) => {
  return (
    <motion.circle
      cx={star.x}
      cy={star.y}
      r={star.radius}
      fill="white"
      initial={{ opacity: star.opacity }}
      animate={
        star.twinkleSpeed !== null
          ? {
              opacity: [star.opacity, star.opacity * 0.3, star.opacity],
              scale: [1, 1.2, 1],
            }
          : {}
      }
      transition={
        star.twinkleSpeed !== null
          ? {
              duration: star.twinkleSpeed,
              repeat: Infinity,
              ease: "easeInOut",
              repeatType: "reverse",
            }
          : {}
      }
    />
  );
});

StarDot.displayName = "StarDot";

export default StarsBackground;
