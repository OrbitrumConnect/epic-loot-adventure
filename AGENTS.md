<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Use TanStack routes for the app shell and lazily load the React Three Fiber world after hydration, because WebGL requires a browser.
- Keep world colors as semantic CSS tokens and share them with Three.js through computed styles, because the game and HUD must follow one design system.
- Keep the initial prototype simulation in React memory and label it local; authoritative multiplayer and persistence require a later connected game service.
