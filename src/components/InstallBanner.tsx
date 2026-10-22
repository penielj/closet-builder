// DESIGN Flow A: on an iPhone, Safari and the home-screen app keep separate storage,
// so anything added in Safari is stranded there. `navigator.standalone` only exists in
// iOS WebKit, where it's false in Safari and true in the installed app.
const inIosSafari = (navigator as Navigator & { standalone?: boolean }).standalone === false

export default function InstallBanner() {
  if (!inIosSafari) return null
  return (
    <p className="banner" role="note">
      Add to Home Screen before you start. What you add in Safari stays in Safari.
    </p>
  )
}
