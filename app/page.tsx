"use client"

import { motion } from "motion/react"
import { AIPrompt } from "./components/prompt"
import { UserButton } from "@/components/user-button"
import { BorderGlow } from "./components/BorderGlow"
import { ProcoraLogo } from "./components/procura-logo"
import { Particles } from "./components/Particles"

const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(5px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.13, delayChildren: 0.05 } },
}

export default function Home() {
  return (
    <main className="min-h-svh flex flex-col overflow-hidden" style={{ background: "var(--p-bg)" }}>

      {/* Particles — floating dots, fixed background */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <Particles
          particleCount={100}
          particleSpread={9}
          speed={0.06}
          particleColors={["#0B5D5B", "#0D7A6E", "#052B45"]}
          alphaParticles={false}
          particleBaseSize={65}
          sizeRandomness={0.6}
          cameraDistance={20}
          moveParticlesOnHover
          particleHoverFactor={0.4}
          disableRotation={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Animated colour blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
        {/* mint — top left */}
        <div className="absolute rounded-full" style={{
          width: 720, height: 720, top: -220, left: -180,
          background: "radial-gradient(circle, #3ED6C23A 0%, transparent 65%)",
          animation: "blob-a 22s ease-in-out infinite",
        }} />
        {/* navy — bottom right */}
        <div className="absolute rounded-full" style={{
          width: 640, height: 640, bottom: -200, right: -160,
          background: "radial-gradient(circle, #052B4530 0%, transparent 65%)",
          animation: "blob-b 28s ease-in-out infinite",
        }} />
        {/* teal — center, slightly left */}
        <div className="absolute rounded-full" style={{
          width: 520, height: 520, top: "38%", left: "22%",
          background: "radial-gradient(circle, #0B5D5B28 0%, transparent 65%)",
          animation: "blob-c 19s ease-in-out infinite",
        }} />
        {/* light mint — bottom centre */}
        <div className="absolute rounded-full" style={{
          width: 480, height: 480, bottom: -120, left: "40%",
          background: "radial-gradient(circle, #6ED7B832 0%, transparent 65%)",
          animation: "blob-d 24s ease-in-out infinite",
        }} />
        {/* soft teal — top right */}
        <div className="absolute rounded-full" style={{
          width: 400, height: 400, top: -80, right: -60,
          background: "radial-gradient(circle, #0D7A6E28 0%, transparent 65%)",
          animation: "blob-e 17s ease-in-out infinite",
        }} />
        {/* rose clair — centre droit */}
        <div className="absolute rounded-full" style={{
          width: 500, height: 500, top: "30%", right: "-80px",
          background: "radial-gradient(circle, #F4A7B92A 0%, transparent 65%)",
          animation: "blob-f 26s ease-in-out infinite",
        }} />
      </div>

      {/* Top bar */}
      <motion.div
        className="flex items-center justify-end px-6 py-3 relative z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <UserButton />
      </motion.div>

      {/* Center */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16 gap-8 relative z-10">
        <motion.div
          className="flex flex-col items-center gap-10 w-full max-w-2xl"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {/* Integrated wordmark */}
          <motion.div variants={item} className="flex flex-col items-center">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
            >
              <ProcoraLogo size="lg" showTagline priority />
            </motion.div>
          </motion.div>

          {/* Tagline */}
          <motion.p
            variants={item}
            className="text-[14.5px] text-center max-w-[400px] leading-[1.65] -mt-3"
            style={{ color: "var(--p-ink-2)" }}
          >
            Describe your need — AI sources suppliers, sends RFQs, and ranks quotes automatically.
          </motion.p>

          {/* Prompt */}
          <motion.div variants={item} className="w-full">
            <BorderGlow
              animated
              backgroundColor="oklch(0.985 0.005 85)"
              glowColor="155 50 38"
              colors={["#2e8b65", "#6bbf97", "#b8892a"]}
              borderRadius={22}
              glowRadius={32}
              glowIntensity={1.0}
              coneSpread={28}
              edgeSensitivity={22}
              fillOpacity={0.22}
              className="w-full"
            >
              <AIPrompt />
            </BorderGlow>
          </motion.div>

          {/* Keyboard hint */}
          <motion.p
            variants={item}
            className="font-mono text-[10px] uppercase tracking-[0.12em] -mt-4"
            style={{ color: "var(--p-faint)" }}
          >
            Enter to search · Shift+Enter for new line
          </motion.p>
        </motion.div>
      </div>

      <style>{`
        @keyframes blob-a {
          0%,100% { transform: translate(0,0) scale(1); }
          30%     { transform: translate(55px,40px) scale(1.07); }
          65%     { transform: translate(-30px,65px) scale(0.96); }
        }
        @keyframes blob-b {
          0%,100% { transform: translate(0,0) scale(1); }
          38%     { transform: translate(-55px,-45px) scale(1.09); }
          72%     { transform: translate(35px,-60px) scale(0.93); }
        }
        @keyframes blob-c {
          0%,100% { transform: translate(0,0) scale(1); }
          25%     { transform: translate(45px,-35px) scale(1.05); }
          55%     { transform: translate(-50px,25px) scale(0.97); }
          80%     { transform: translate(20px,50px) scale(1.03); }
        }
        @keyframes blob-d {
          0%,100% { transform: translate(0,0) scale(1); }
          42%     { transform: translate(-40px,-30px) scale(1.08); }
          78%     { transform: translate(50px,-20px) scale(0.94); }
        }
        @keyframes blob-e {
          0%,100% { transform: translate(0,0) scale(1); }
          35%     { transform: translate(-45px,50px) scale(1.06); }
          68%     { transform: translate(30px,25px) scale(0.95); }
        }
        @keyframes blob-f {
          0%,100% { transform: translate(0,0) scale(1); }
          28%     { transform: translate(-60px,40px) scale(1.07); }
          60%     { transform: translate(-25px,-55px) scale(0.95); }
          82%     { transform: translate(-50px,20px) scale(1.03); }
        }
      `}</style>
    </main>
  )
}
