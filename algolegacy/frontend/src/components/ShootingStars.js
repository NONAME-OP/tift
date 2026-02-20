import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const getRandomStartPoint = () => {
  const side = Math.floor(Math.random() * 4);
  const offset = Math.random() * window.innerWidth;

  switch (side) {
    case 0: // top
      return { x: offset, y: 0, angle: 45 };
    case 1: // right
      return { x: window.innerWidth, y: offset, angle: 135 };
    case 2: // bottom
      return { x: offset, y: window.innerHeight, angle: 225 };
    case 3: // left
      return { x: 0, y: offset, angle: 315 };
    default:
      return { x: offset, y: 0, angle: 45 };
  }
};

export const ShootingStars = ({
  minSpeed = 10,
  maxSpeed = 30,
  minDelay = 4200,
  maxDelay = 8700,
  starColor = "#9E00FF",
  trailColor = "#2EB9DF",
  starWidth = 10,
  starHeight = 1,
  className = "",
}) => {
  const [star, setStar] = useState(null);
  const svgRef = useRef(null);

  const createStar = useCallback(() => {
    const { x, y, angle } = getRandomStartPoint();
    const newStar = {
      id: Date.now(),
      x,
      y,
      angle,
      scale: 1,
      speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
      distance: 0,
    };
    setStar(newStar);

    const timer = setTimeout(() => {
      setStar(null);
    }, 1000);

    return () => clearTimeout(timer);
  }, [minSpeed, maxSpeed]);

  useEffect(() => {
    let cleanupStar;
    const createAndSchedule = () => {
      cleanupStar = createStar();
      const delay = Math.random() * (maxDelay - minDelay) + minDelay;
      const timer = setTimeout(createAndSchedule, delay);
      return () => {
        clearTimeout(timer);
        if (cleanupStar) cleanupStar();
      };
    };

    const cleanup = createAndSchedule();
    return cleanup;
  }, [createStar, minDelay, maxDelay]);

  return (
    <svg
      ref={svgRef}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <AnimatePresence mode="wait">
        {star && (
          <ShootingStar
            key={star.id}
            star={star}
            starColor={starColor}
            trailColor={trailColor}
            starWidth={starWidth}
            starHeight={starHeight}
          />
        )}
      </AnimatePresence>
    </svg>
  );
};

const ShootingStar = ({ star, starColor, trailColor, starWidth, starHeight }) => {
  const { x, y, angle, speed } = star;
  const rad = (angle * Math.PI) / 180;
  const distance = speed * 60;
  const endX = x + distance * Math.cos(rad);
  const endY = y + distance * Math.sin(rad);
  const gradientId = `gradient-${star.id}`;

  return (
    <motion.line
      x1={x}
      y1={y}
      x2={x}
      y2={y}
      stroke={`url(#${gradientId})`}
      strokeWidth={starHeight}
      strokeLinecap="round"
      initial={{ x2: x, y2: y, opacity: 1 }}
      animate={{
        x2: endX,
        y2: endY,
        opacity: [1, 1, 0],
        x1: [x, x + (endX - x) * 0.5, endX],
        y1: [y, y + (endY - y) * 0.5, endY],
      }}
      exit={{ opacity: 0 }}
      transition={{
        duration: speed * 0.05,
        ease: "linear",
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={trailColor} stopOpacity="0" />
          <stop offset="100%" stopColor={starColor} stopOpacity="1" />
        </linearGradient>
      </defs>
    </motion.line>
  );
};

export default ShootingStars;
