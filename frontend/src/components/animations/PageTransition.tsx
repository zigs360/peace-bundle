import React from "react";
import { motion, MotionProps } from "framer-motion";
import { pageVariants } from "./variants";

interface PageTransitionProps extends MotionProps {
  children: React.ReactNode;
  className?: string;
}

const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      className={`w-full ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
