import React, { useEffect, useRef, useState } from "react";

// Hook to detect when element is in view
function useInView(options = { threshold: 0.1, rootMargin: "0px" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated) {
        setIsInView(true);
        setHasAnimated(true); // Trigger once
      }
    }, options);

    observer.observe(element);
    return () => observer.disconnect();
  }, [options, hasAnimated]);

  return { ref, isInView };
}

interface BaseMotionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  delay?: number; // seconds
}

// 1. Fade In
export const FadeIn: React.FC<BaseMotionProps> = ({
  children,
  delay = 0,
  className = "",
  style,
  ...props
}) => {
  const { ref, isInView } = useInView();
  
  return (
    <div
      ref={ref}
      className={`${className} transition-opacity duration-700 ease-out`}
      style={{
        opacity: isInView ? 1 : 0,
        transitionDelay: `${delay}s`,
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

// 2. Slide Up
export const SlideUp: React.FC<BaseMotionProps> = ({
  children,
  delay = 0,
  className = "",
  style,
  ...props
}) => {
  const { ref, isInView } = useInView();

  return (
    <div
      ref={ref}
      className={`${className} transition-all duration-700 ease-out transform`}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translateY(0)" : "translateY(40px)",
        transitionDelay: `${delay}s`,
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

// 3. Scale In
export const ScaleIn: React.FC<BaseMotionProps> = ({
  children,
  delay = 0,
  className = "",
  style,
  ...props
}) => {
  const { ref, isInView } = useInView();

  return (
    <div
      ref={ref}
      className={`${className} transition-all duration-500 ease-out transform`}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? "scale(1)" : "scale(0.9)",
        transitionDelay: `${delay}s`,
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

// 4. Stagger Container (Mock implementation for CSS - just renders children)
// In a CSS-only world, implementing true stagger without passing props to children is hard.
// We'll just render the children and let them handle their own delays if needed, 
// or we can use a Context to pass delay index? 
// For simplicity and robustness, we'll just render children. 
// If specific items need delays, we can add them manually or use CSS nth-child selectors in global css.
export const StaggerContainer: React.FC<BaseMotionProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
};

export const StaggerItem: React.FC<BaseMotionProps> = ({
  children,
  className = "",
  ...props
}) => {
  // Just treat as a SlideUp for now with default delay
  return (
    <SlideUp className={className} {...props}>
      {children}
    </SlideUp>
  );
};

// 5. Hover Card
export const HoverCard: React.FC<BaseMotionProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`${className} transition-transform duration-300 hover:-translate-y-2 hover:shadow-lg`}
      {...props}
    >
      {children}
    </div>
  );
};
