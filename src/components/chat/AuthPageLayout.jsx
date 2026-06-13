import PixelBlast from '../PixelBlast';

const AuthPageLayout = ({ children }) => (
  <div className="min-h-dvh flex flex-col lg:flex-row bg-black font-sans selection:bg-[#2F7F7A]/30">
    <div className="relative hidden w-full lg:flex lg:w-[40%] flex-col items-center justify-center overflow-hidden bg-[#050505] border-r border-zinc-900">
      <div className="absolute inset-0 z-0">
        <PixelBlast
          variant="square"
          pixelSize={3}
          color="#2F7F7A"
          patternScale={2}
          patternDensity={1}
          enableRipples
          rippleSpeed={0.3}
          rippleThickness={0.1}
          rippleIntensityScale={1}
          speed={0.5}
          transparent
          edgeFade={0.5}
        />
      </div>
      <div className="relative z-10 flex flex-col items-center text-center px-8">
        <h1 className="text-3xl xl:text-4xl font-medium tracking-tight text-white leading-tight">
          Build on Genomic Data <br />
          without slowing down.
        </h1>
      </div>
    </div>

    <div className="relative flex flex-1 flex-col bg-black">
      <div className="absolute inset-0 z-0 lg:hidden pointer-events-none">
        <PixelBlast
          variant="square"
          pixelSize={3}
          color="#2F7F7A"
          patternScale={2}
          patternDensity={1}
          enableRipples
          rippleSpeed={0.3}
          rippleThickness={0.1}
          rippleIntensityScale={1}
          speed={0.5}
          transparent
          edgeFade={0.5}
        />
      </div>
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-20">
        <div className="w-full max-w-[400px]">
          {children}
        </div>
      </main>
    </div>
  </div>
);

export default AuthPageLayout;
