<script lang="ts">
  import "@fontsource-variable/chiron-goround-tc";
  import { onMount } from "svelte";
  import Icon from "@/components/common/Icon.svelte";
  import type {
    DiscoverConfig,
    DiscoverSearchEngine,
    DiscoverWallpaperPreference,
  } from "@/types/discoverConfig";

  interface Props {
    config: DiscoverConfig;
    desktopWallpapers: string[];
    mobileWallpapers: string[];
  }

  type StoredSettings = {
    wallpaperPreference: DiscoverWallpaperPreference;
    dimmed: boolean;
    blur: number;
    searchSuggestions: boolean;
    openInNewTab: boolean;
    showSeconds: boolean;
    showLunar: boolean;
    use12Hour: boolean;
    engineId: string;
  };

  const STORAGE_KEY = "firefly-discover-settings";
  const RECENT_SEARCH_KEY = "firefly-discover-recent-searches";
  const MAX_RECENT_SEARCHES = 5;

  let { config, desktopWallpapers, mobileWallpapers }: Props = $props();

  let now = $state(new Date());
  let settingsOpen = $state(false);
  let engineMenuOpen = $state(false);
  let searchFocused = $state(false);
  let searchActive = $state(false);
  let query = $state("");
  let recentSearches = $state<string[]>([]);
  let searchInput: HTMLInputElement | undefined = $state();
  let searchContainer: HTMLDivElement | undefined = $state();

  let wallpaperPreference = $state(config.wallpaper.defaultPreference);
  let wallpaperDimmed = $state(config.wallpaper.dimmed);
  let wallpaperBlur = $state(config.wallpaper.blur);
  let searchSuggestions = $state(config.search.suggestions);
  let openInNewTab = $state(config.search.openInNewTab);
  let showSeconds = $state(config.time.showSeconds);
  let showLunar = $state(config.time.showLunar);
  let use12Hour = $state(config.time.use12Hour);
  let engineId = $state(config.search.defaultEngine);

  let siteWallpaperIndex = $state(0);
  let randomWallpaperUrl = $state(withCacheBust(config.wallpaper.randomUrl));
  let wallpaperFallbacks = $state(0);

  const selectedEngine = $derived(
    config.search.engines.find((engine) => engine.id === engineId) ??
      config.search.engines[0],
  );

  const clockDigits = $derived(formatClockDigits(now, use12Hour));
  const colonVisible = $derived(now.getSeconds() % 2 === 0);
  const dateParts = $derived(formatDateParts(now));
  const lunarParts = $derived(showLunar ? formatLunarParts(now) : null);

  const filteredSuggestions = $derived.by(() => {
    if (!searchSuggestions) return [];
    const source = [...recentSearches, ...config.search.suggestionItems].filter(
      (item, index, items) => items.indexOf(item) === index,
    );
    const keyword = query.trim().toLocaleLowerCase();
    return source
      .filter((item) => !keyword || item.toLocaleLowerCase().includes(keyword))
      .slice(0, 6);
  });

  const desktopWallpaper = $derived(resolveWallpaper(desktopWallpapers, false));
  const mobileWallpaper = $derived(
    resolveWallpaper(
      mobileWallpapers.length > 0 ? mobileWallpapers : desktopWallpapers,
      true,
    ),
  );

  function withCacheBust(url: string): string {
    if (!url) return "";
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}discover=${Date.now()}`;
  }

  function resolveWallpaper(items: string[], mobile: boolean): string {
    if (wallpaperPreference === "daily") return config.wallpaper.dailyUrl;
    if (wallpaperPreference === "random") return randomWallpaperUrl;
    if (items.length === 0) return config.wallpaper.dailyUrl;
    const offset = mobile ? 1 : 0;
    return items[(siteWallpaperIndex + offset) % items.length] ?? items[0];
  }

  type ClockDigits = {
    hour: string;
    minute: string;
    second: string;
    period: string;
  };

  function formatClockDigits(date: Date, hour12: boolean): ClockDigits {
    const parts = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12,
    }).formatToParts(date);
    const find = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return {
      hour: find("hour"),
      minute: find("minute"),
      second: find("second"),
      period: find("dayPeriod"),
    };
  }

  type DateParts = { month: string; day: string; weekday: string };

  function formatDateParts(date: Date): DateParts {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).formatToParts(date);
    const find = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return {
      month: find("month"),
      day: find("day"),
      weekday: find("weekday"),
    };
  }

  type LunarParts = { year: string; monthDay: string } | null;

  function formatLunarParts(date: Date): LunarParts {
    try {
      const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
        dateStyle: "long",
      }).formatToParts(date);
      const year = parts.find((part) => part.type === "yearName")?.value ?? "";
      const monthDay = parts
        .filter((part) => part.type === "month" || part.type === "day")
        .map((part) => part.value)
        .join("");
      if (!year || !monthDay) return null;
      return { year, monthDay };
    } catch {
      return null;
    }
  }

  function readStoredSettings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredSettings>;
      if (
        stored.wallpaperPreference === "daily" ||
        stored.wallpaperPreference === "random" ||
        stored.wallpaperPreference === "site"
      ) {
        wallpaperPreference = stored.wallpaperPreference;
      }
      if (typeof stored.dimmed === "boolean") wallpaperDimmed = stored.dimmed;
      if (typeof stored.blur === "number") {
        wallpaperBlur = Math.min(20, Math.max(0, stored.blur));
      }
      if (typeof stored.searchSuggestions === "boolean") {
        searchSuggestions = stored.searchSuggestions;
      }
      if (typeof stored.openInNewTab === "boolean") {
        openInNewTab = stored.openInNewTab;
      }
      if (typeof stored.showSeconds === "boolean") {
        showSeconds = stored.showSeconds;
      }
      if (typeof stored.showLunar === "boolean") showLunar = stored.showLunar;
      if (typeof stored.use12Hour === "boolean") use12Hour = stored.use12Hour;
      if (
        stored.engineId &&
        config.search.engines.some((engine) => engine.id === stored.engineId)
      ) {
        engineId = stored.engineId;
      }
    } catch {
      // 本地数据损坏时沿用配置默认值，避免阻断页面初始化。
    }
  }

  function persistSettings(): void {
    const settings: StoredSettings = {
      wallpaperPreference,
      dimmed: wallpaperDimmed,
      blur: wallpaperBlur,
      searchSuggestions,
      openInNewTab,
      showSeconds,
      showLunar,
      use12Hour,
      engineId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function setWallpaperPreference(
    preference: DiscoverWallpaperPreference,
  ): void {
    wallpaperPreference = preference;
    wallpaperFallbacks = 0;
    if (preference === "random") {
      randomWallpaperUrl = withCacheBust(config.wallpaper.randomUrl);
    }
    if (preference === "site" && desktopWallpapers.length > 1) {
      siteWallpaperIndex = Math.floor(Math.random() * desktopWallpapers.length);
    }
    persistSettings();
  }

  function handleWallpaperError(): void {
    wallpaperFallbacks += 1;
    if (wallpaperPreference !== "site" && desktopWallpapers.length > 0) {
      wallpaperPreference = "site";
      siteWallpaperIndex = 0;
      persistSettings();
      return;
    }
    if (
      desktopWallpapers.length > 1 &&
      wallpaperFallbacks < desktopWallpapers.length
    ) {
      siteWallpaperIndex = (siteWallpaperIndex + 1) % desktopWallpapers.length;
    }
  }

  function setEngine(engine: DiscoverSearchEngine): void {
    engineId = engine.id;
    engineMenuOpen = false;
    searchActive = true;
    persistSettings();
    focusSearchInput();
  }

  function focusSearchInput(): void {
    requestAnimationFrame(() => searchInput?.focus({ preventScroll: true }));
  }

  function activateSearch(): void {
    searchActive = true;
    searchFocused = true;
  }

  function toggleEngineMenu(): void {
    searchActive = true;
    engineMenuOpen = !engineMenuOpen;
    focusSearchInput();
  }

  function rememberSearch(value: string): void {
    recentSearches = [
      value,
      ...recentSearches.filter((item) => item !== value),
    ].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recentSearches));
  }

  function submitSearch(event?: SubmitEvent): void {
    event?.preventDefault();
    const value = query.trim();
    if (!value || !selectedEngine) return;
    rememberSearch(value);
    const destination = selectedEngine.url.replace(
      "{query}",
      encodeURIComponent(value),
    );
    if (openInNewTab) {
      window.open(destination, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(destination);
    }
  }

  function chooseSuggestion(value: string): void {
    query = value;
    searchFocused = false;
    queueMicrotask(() => submitSearch());
  }

  function closeSettings(): void {
    settingsOpen = false;
  }

  function toggleSetting(
    key:
      | "dimmed"
      | "searchSuggestions"
      | "openInNewTab"
      | "showSeconds"
      | "showLunar"
      | "use12Hour",
  ): void {
    switch (key) {
      case "dimmed":
        wallpaperDimmed = !wallpaperDimmed;
        break;
      case "searchSuggestions":
        searchSuggestions = !searchSuggestions;
        break;
      case "openInNewTab":
        openInNewTab = !openInNewTab;
        break;
      case "showSeconds":
        showSeconds = !showSeconds;
        break;
      case "showLunar":
        showLunar = !showLunar;
        break;
      case "use12Hour":
        use12Hour = !use12Hour;
        break;
    }
    persistSettings();
  }

  onMount(() => {
    readStoredSettings();
    try {
      const recent = JSON.parse(
        localStorage.getItem(RECENT_SEARCH_KEY) ?? "[]",
      ) as unknown;
      if (Array.isArray(recent)) {
        recentSearches = recent.filter(
          (item): item is string => typeof item === "string",
        );
      }
    } catch {
      recentSearches = [];
    }

    if (desktopWallpapers.length > 1) {
      siteWallpaperIndex = Math.floor(Math.random() * desktopWallpapers.length);
    }

    // 探索页使用独立全屏骨架，所有离开页面的站内链接都走完整页面导航。
    const navLinks = document.querySelectorAll<HTMLAnchorElement>(
      "#navbar a, #nav-menu-panel a",
    );
    for (const link of navLinks) link.dataset.noSwup = "";
    document.body.classList.add("discover-page-active");

    // 对齐到自然秒边界更新，让数字变化和冒号闪烁保持同一节拍。
    let timer: number;
    const updateClock = () => {
      now = new Date();
      timer = window.setTimeout(updateClock, 1000 - (Date.now() % 1000));
    };
    timer = window.setTimeout(updateClock, 1000 - (Date.now() % 1000));
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (engineMenuOpen) {
          engineMenuOpen = false;
          focusSearchInput();
        } else if (searchActive && !settingsOpen) {
          searchActive = false;
          searchFocused = false;
          searchInput?.blur();
        } else if (settingsOpen) closeSettings();
      }
    };
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || searchContainer?.contains(target))
        return;
      engineMenuOpen = false;
      searchActive = false;
      searchFocused = false;
    };
    window.addEventListener("keydown", handleKeydown);
    document.addEventListener("pointerdown", handleDocumentPointerDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.body.classList.remove("discover-page-active");
    };
  });
</script>

<div
  class="discover-shell"
  class:search-active={searchActive}
  data-pagefind-ignore
>
  <picture class="discover-wallpaper" aria-hidden="true">
    <source media="(max-width: 767px)" srcset={mobileWallpaper} />
    <img
      src={desktopWallpaper}
      alt=""
      style={`--wallpaper-blur: ${wallpaperBlur}px; --wallpaper-scale: ${1 + wallpaperBlur / 300};`}
      onerror={handleWallpaperError}
    />
  </picture>
  <div
    class="wallpaper-veil"
    class:is-dimmed={wallpaperDimmed}
    aria-hidden="true"
  ></div>
  <div class="ambient ambient-one" aria-hidden="true"></div>
  <div class="ambient ambient-two" aria-hidden="true"></div>

  <section class="discover-stage" aria-label={config.title}>
    <button
      type="button"
      class="clock-block"
      onclick={() => (settingsOpen = true)}
      aria-label="打开探索设置"
      aria-haspopup="dialog"
    >
      <div class="time-container normal" class:has-lunar={!!lunarParts}>
        <div class="time">
          <span class="digit">{clockDigits.hour}</span>
          <span class="separator" class:is-visible={colonVisible} aria-hidden="true">:</span>
          <span class="digit">{clockDigits.minute}</span>
          {#if showSeconds}
            <span class="seconds">
              <span class="separator" class:is-visible={colonVisible} aria-hidden="true">:</span>
              <span class="digit">{clockDigits.second}</span>
            </span>
          {/if}
          {#if use12Hour}
            <span class="meridiem">{clockDigits.period}</span>
          {/if}
        </div>
        {#if lunarParts}
          <div class="lunar">
            <span class="year">{lunarParts.year}年</span>
            <span class="month-day">{lunarParts.monthDay}</span>
          </div>
        {/if}
        <div class="date">
          <span class="month">{dateParts.month}月</span>
          <span class="day">{dateParts.day}日</span>
          <span class="weekday">{dateParts.weekday}</span>
        </div>
      </div>
    </button>

    <div class="search-wrap" bind:this={searchContainer}>
      <form class="search-bar" onsubmit={submitSearch} role="search">
        <div class="engine-wrap">
          <button
            type="button"
            class="engine-button"
            onclick={toggleEngineMenu}
            aria-label={`选择搜索引擎，当前为 ${selectedEngine?.name ?? "搜索"}`}
            aria-expanded={engineMenuOpen}
          >
            <span>{selectedEngine?.badge ?? "搜"}</span>
          </button>
        </div>
        <input
          bind:this={searchInput}
          bind:value={query}
          type="search"
          placeholder={config.search.placeholder}
          aria-label={config.search.placeholder}
          autocomplete="off"
          onfocus={activateSearch}
          onblur={() => {
            queueMicrotask(() => {
              searchFocused = document.activeElement === searchInput;
            });
          }}
        />
        <button type="submit" class="search-button" aria-label="搜索">
          <Icon icon="material-symbols:search" />
        </button>
      </form>

      {#if engineMenuOpen}
        <div class="engine-menu" role="menu" aria-label="搜索引擎">
          {#each config.search.engines as engine}
            <button
              type="button"
              class:active={engine.id === selectedEngine?.id}
              onclick={() => setEngine(engine)}
              role="menuitem"
            >
              <span class="engine-badge">{engine.badge}</span>
              {engine.name}
            </button>
          {/each}
        </div>
      {/if}

      {#if searchFocused && !engineMenuOpen && query.trim() && filteredSuggestions.length > 0}
        <div class="suggestions" aria-label="搜索建议">
          {#each filteredSuggestions as suggestion}
            <button
              type="button"
              onmousedown={(event) => event.preventDefault()}
              onclick={() => chooseSuggestion(suggestion)}
            >
              <Icon icon="material-symbols:search" />
              <span>{suggestion}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <nav class="quick-dock" aria-label="快捷入口">
      {#each config.quickLinks as link}
        <a
          href={link.url}
          target={link.external ? "_blank" : undefined}
          rel={link.external ? "noopener noreferrer" : undefined}
          data-no-swup={!link.external ? "" : undefined}
        >
          <span class="quick-icon"><Icon icon={link.icon} /></span>
          <span>{link.name}</span>
        </a>
      {/each}
    </nav>
  </section>

  <div class="corner-actions" aria-label="页面操作">
    <a href="/" data-no-swup aria-label="返回主页">
      <Icon icon="material-symbols:home" />
    </a>
    <button
      type="button"
      onclick={() => (settingsOpen = true)}
      aria-label="打开探索设置"
      aria-haspopup="dialog"
    >
      <Icon icon="material-symbols:settings" />
    </button>
  </div>

  {#if settingsOpen}
    <div
      class="settings-layer"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) closeSettings();
      }}
    >
      <section
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-settings-title"
      >
        <header class="settings-header">
          <div>
            <span class="eyebrow">DISCOVER</span>
            <h2 id="discover-settings-title">探索设置</h2>
          </div>
          <button type="button" onclick={closeSettings} aria-label="关闭设置">
            <Icon icon="material-symbols:close" />
          </button>
        </header>

        <div class="settings-scroll">
          <section class="settings-section">
            <div class="section-heading">
              <Icon icon="material-symbols:image-outline" />
              <div>
                <h3>壁纸</h3>
                <p>选择探索页的背景呈现方式</p>
              </div>
            </div>
            <div class="segmented" aria-label="壁纸偏好">
              <button
                type="button"
                class:active={wallpaperPreference === "daily"}
                onclick={() => setWallpaperPreference("daily")}>每日必应</button
              >
              <button
                type="button"
                class:active={wallpaperPreference === "random"}
                onclick={() => setWallpaperPreference("random")}
                >随机封面</button
              >
              <button
                type="button"
                class:active={wallpaperPreference === "site"}
                onclick={() => setWallpaperPreference("site")}>网站背景</button
              >
            </div>
            <button
              type="button"
              class="setting-row"
              onclick={() => toggleSetting("dimmed")}
            >
              <span
                ><strong>壁纸遮罩</strong><small>增强前景内容可读性</small
                ></span
              >
              <span class="switch" class:on={wallpaperDimmed} aria-hidden="true"
                ><i></i></span
              >
            </button>
            <label class="setting-row slider-row">
              <span
                ><strong>壁纸模糊</strong><small>{wallpaperBlur}px</small></span
              >
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={wallpaperBlur}
                oninput={(event) => {
                  wallpaperBlur = Number(event.currentTarget.value);
                  persistSettings();
                }}
              />
            </label>
          </section>

          <section class="settings-section">
            <div class="section-heading">
              <Icon icon="material-symbols:search" />
              <div>
                <h3>搜索</h3>
                <p>管理搜索框行为</p>
              </div>
            </div>
            <button
              type="button"
              class="setting-row"
              onclick={() => toggleSetting("searchSuggestions")}
            >
              <span
                ><strong>搜索建议</strong><small>显示最近记录和推荐关键词</small
                ></span
              >
              <span
                class="switch"
                class:on={searchSuggestions}
                aria-hidden="true"><i></i></span
              >
            </button>
            <button
              type="button"
              class="setting-row"
              onclick={() => toggleSetting("openInNewTab")}
            >
              <span
                ><strong>新标签页打开</strong><small>保留当前探索页面</small
                ></span
              >
              <span class="switch" class:on={openInNewTab} aria-hidden="true"
                ><i></i></span
              >
            </button>
          </section>

          <section class="settings-section">
            <div class="section-heading">
              <Icon icon="material-symbols:view-day-outline" />
              <div>
                <h3>时间</h3>
                <p>自定义时钟显示内容</p>
              </div>
            </div>
            <button
              type="button"
              class="setting-row"
              onclick={() => toggleSetting("showSeconds")}
            >
              <span
                ><strong>显示秒钟</strong><small>在时钟中显示秒数</small></span
              >
              <span class="switch" class:on={showSeconds} aria-hidden="true"
                ><i></i></span
              >
            </button>
            <button
              type="button"
              class="setting-row"
              onclick={() => toggleSetting("showLunar")}
            >
              <span
                ><strong>显示农历</strong><small>在公历日期上方显示农历</small
                ></span
              >
              <span class="switch" class:on={showLunar} aria-hidden="true"
                ><i></i></span
              >
            </button>
            <button
              type="button"
              class="setting-row"
              onclick={() => toggleSetting("use12Hour")}
            >
              <span
                ><strong>12 小时制</strong><small>使用上午 / 下午时间格式</small
                ></span
              >
              <span class="switch" class:on={use12Hour} aria-hidden="true"
                ><i></i></span
              >
            </button>
          </section>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  :global(body.discover-page-active) {
    overflow: hidden;
  }

  .discover-shell {
    position: fixed;
    inset: 0;
    z-index: 20;
    min-height: 100svh;
    overflow: hidden;
    color: white;
    background: #101933;
    isolation: isolate;
  }

  .discover-wallpaper,
  .discover-wallpaper img,
  .wallpaper-veil,
  .ambient {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .discover-wallpaper img {
    object-fit: cover;
    object-position: center;
    filter: blur(var(--wallpaper-blur, 0px));
    transform: scale(var(--wallpaper-scale, 1));
    transition:
      filter 380ms ease,
      transform 500ms ease,
      opacity 400ms ease;
  }

  .discover-shell.search-active .discover-wallpaper img {
    filter: blur(calc(var(--wallpaper-blur, 0px) + 9px)) brightness(0.84);
    transform: scale(calc(var(--wallpaper-scale, 1) + 0.035));
  }

  .wallpaper-veil {
    z-index: 1;
    background: linear-gradient(
        180deg,
        rgba(8, 14, 35, 0.24) 0%,
        transparent 35%
      ),
      linear-gradient(0deg, rgba(7, 12, 29, 0.35) 0%, transparent 42%);
    transition: background-color 250ms ease;
  }

  .wallpaper-veil.is-dimmed {
    background-color: rgba(4, 11, 28, 0.22);
  }

  .discover-shell.search-active .wallpaper-veil {
    background-color: rgba(4, 9, 23, 0.34);
  }

  .ambient {
    z-index: 1;
    pointer-events: none;
    filter: blur(70px);
    opacity: 0.28;
  }

  .ambient-one {
    inset: auto auto -12rem -10rem;
    width: 34rem;
    height: 34rem;
    background: #3ce6f4;
  }

  .ambient-two {
    inset: -12rem -10rem auto auto;
    width: 36rem;
    height: 36rem;
    background: #d182ff;
  }

  .discover-stage {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-rows: 1fr auto;
    align-content: center;
    justify-items: center;
    box-sizing: border-box;
    width: min(100%, 76rem);
    height: 100%;
    margin: 0 auto;
    padding: clamp(6.5rem, 13vh, 9rem) 1.5rem clamp(1.5rem, 4vh, 3rem);
  }

  .clock-block {
    position: relative;
    top: 5.625rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    align-self: start;
    margin: clamp(0.5rem, 2vh, 1.5rem) 0 0;
    padding: 0.4rem 1rem;
    color: inherit;
    text-align: center;
    text-shadow: 0 3px 16px rgba(3, 10, 28, 0.55);
    background: transparent;
    border: 0;
    border-radius: 1rem;
    cursor: pointer;
    transition:
      transform 380ms ease,
      background 180ms ease,
      opacity 280ms ease;
  }

  .clock-block:hover,
  .clock-block:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    outline: none;
  }

  .clock-block:hover .time,
  .clock-block:focus-visible .time {
    transform: scale(1.1);
  }

  .time-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: "Chiron GoRound TC Variable", sans-serif;
  }

  .time {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 4.3125rem;
    font-size: 3.5rem;
    font-weight: 500;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    transform-origin: center;
    transition: transform 180ms ease;
  }

  .digit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 4.125rem;
    height: 4.3125rem;
  }

  .seconds {
    display: contents;
  }

  .meridiem {
    margin-left: 0.3em;
    font-size: 0.42em;
    font-weight: 480;
    letter-spacing: 0.08em;
    opacity: 0.75;
  }

  .separator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.875rem;
    height: 3.4375rem;
    opacity: 0;
  }

  .separator.is-visible {
    opacity: 1;
  }

  .lunar {
    display: flex;
    justify-content: center;
    gap: 0.4em;
    margin-top: 1.15rem;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.125rem;
    opacity: 0.8;
  }

  .lunar span,
  .date span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .lunar .year {
    width: 2.9375rem;
    height: 1.125rem;
  }

  .lunar .month-day {
    width: 3.5625rem;
    height: 1.125rem;
  }

  .date {
    display: flex;
    justify-content: center;
    gap: 0.35em;
    margin-top: 0.35rem;
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.375rem;
  }

  .date .month,
  .date .weekday {
    width: 2.3125rem;
    height: 1.375rem;
  }

  .date .day {
    width: 3.25rem;
    height: 1.375rem;
  }

  .search-wrap {
    position: relative;
    z-index: 4;
    align-self: start;
    width: min(52rem, 82vw);
    transition: transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .discover-shell.search-active .search-wrap {
    transform: translateY(-4.25rem);
  }

  .discover-shell.search-active .clock-block {
    transform: translateY(-1.5rem);
    opacity: 0.86;
  }

  .search-bar {
    display: grid;
    grid-template-columns: 3.5rem 1fr 3.5rem;
    align-items: center;
    height: 3.75rem;
    background: linear-gradient(
      110deg,
      rgba(20, 39, 73, 0.66),
      rgba(38, 25, 59, 0.55)
    );
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 1.1rem;
    box-shadow:
      0 1.2rem 3rem rgba(4, 9, 24, 0.2),
      inset 0 1px rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(20px) saturate(1.3);
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease;
  }

  .search-bar:focus-within {
    border-color: rgba(98, 229, 255, 0.8);
    box-shadow:
      0 1.2rem 3rem rgba(4, 9, 24, 0.25),
      0 0 0 3px rgba(61, 220, 255, 0.13);
  }

  .search-bar input {
    min-width: 0;
    width: 100%;
    padding: 0 0.5rem;
    color: white;
    font: inherit;
    font-size: 1.04rem;
    font-weight: 550;
    text-align: center;
    background: transparent;
    border: 0;
    outline: 0;
  }

  .search-bar input::placeholder {
    color: rgba(255, 255, 255, 0.72);
  }

  .search-bar input::-webkit-search-cancel-button {
    display: none;
  }

  .engine-wrap {
    position: relative;
  }

  .engine-button,
  .search-button {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    margin: auto;
    color: white;
    font-weight: 750;
    background: transparent;
    border: 0;
    border-radius: 0.8rem;
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .engine-button:hover,
  .search-button:hover,
  .engine-button:focus-visible,
  .search-button:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    transform: scale(1.04);
    outline: none;
  }

  .search-button :global(svg) {
    font-size: 1.55rem;
  }

  .engine-menu,
  .suggestions {
    position: absolute;
    z-index: 6;
    top: calc(100% + 0.6rem);
    padding: 0.45rem;
    background: rgba(18, 30, 57, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.9rem;
    box-shadow: 0 1rem 3rem rgba(4, 9, 24, 0.32);
    backdrop-filter: blur(24px) saturate(1.4);
  }

  .engine-menu {
    left: 0;
    right: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    padding: 0.65rem;
    animation: engine-menu-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  .engine-menu button,
  .suggestions button {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.7rem 0.8rem;
    color: white;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 560;
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 0.65rem;
    cursor: pointer;
  }

  .engine-menu button {
    min-height: 3rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .engine-menu button:hover,
  .engine-menu button.active,
  .suggestions button:hover {
    background: rgba(86, 222, 255, 0.15);
  }

  .engine-menu button.active {
    border-color: rgba(115, 231, 255, 0.72);
    box-shadow: inset 0 0 0 1px rgba(164, 129, 255, 0.36);
  }

  .engine-badge {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    font-size: 0.72rem;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 0.45rem;
  }

  .suggestions {
    left: 0;
    right: 0;
  }

  .suggestions :global(svg) {
    font-size: 1rem;
    opacity: 0.7;
  }

  .quick-dock {
    display: flex;
    align-items: stretch;
    gap: 0.35rem;
    align-self: end;
    max-width: min(100%, 46rem);
    margin-top: clamp(2.5rem, 9vh, 7rem);
    padding: 0.55rem;
    background: rgba(47, 65, 100, 0.44);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 1.15rem;
    box-shadow: 0 1rem 3rem rgba(4, 9, 24, 0.18);
    backdrop-filter: blur(22px) saturate(1.35);
    transition:
      opacity 260ms ease,
      transform 360ms ease;
  }

  .discover-shell.search-active .quick-dock {
    opacity: 0;
    transform: translateY(1.2rem) scale(0.96);
    pointer-events: none;
  }

  .quick-dock a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.32rem;
    min-width: 4.6rem;
    padding: 0.55rem 0.65rem;
    color: white;
    font-size: 0.76rem;
    font-weight: 650;
    text-decoration: none;
    border-radius: 0.8rem;
    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .quick-dock a:hover,
  .quick-dock a:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-2px);
    outline: none;
  }

  .quick-icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    font-size: 1.45rem;
    background: linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.22),
      rgba(255, 255, 255, 0.06)
    );
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 0.7rem;
  }

  .corner-actions {
    position: absolute;
    z-index: 3;
    right: clamp(1rem, 2.4vw, 2.3rem);
    bottom: clamp(1.1rem, 3vh, 2.1rem);
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .corner-actions a,
  .corner-actions button {
    display: grid;
    place-items: center;
    width: 2.8rem;
    height: 2.8rem;
    padding: 0;
    color: white;
    font-size: 1.5rem;
    background: rgba(25, 40, 70, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 0.9rem;
    box-shadow: 0 0.7rem 2rem rgba(3, 9, 24, 0.2);
    backdrop-filter: blur(18px);
    cursor: pointer;
    transition:
      transform 160ms ease,
      background 160ms ease;
  }

  .corner-actions a:hover,
  .corner-actions button:hover,
  .corner-actions a:focus-visible,
  .corner-actions button:focus-visible {
    background: rgba(74, 211, 244, 0.26);
    transform: translateX(-2px);
    outline: none;
  }

  .settings-layer {
    position: absolute;
    z-index: 10;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 5.6rem 1.25rem 1.5rem;
    background: rgba(5, 11, 27, 0.4);
    backdrop-filter: blur(12px);
    animation: layer-in 180ms ease both;
  }

  .settings-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(68rem, 92vw);
    max-height: min(46rem, calc(100svh - 7.5rem));
    color: rgba(255, 255, 255, 0.94);
    background: linear-gradient(
      145deg,
      rgba(40, 63, 100, 0.72),
      rgba(46, 35, 75, 0.58)
    );
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 1.25rem;
    box-shadow:
      0 2rem 6rem rgba(3, 8, 24, 0.36),
      inset 0 1px rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(32px) saturate(1.4);
    overflow: hidden;
    animation: panel-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 1.35rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.13);
  }

  .settings-header h2,
  .settings-section h3,
  .settings-section p {
    margin: 0;
  }

  .settings-header h2 {
    font-size: clamp(1.25rem, 2vw, 1.6rem);
    line-height: 1.15;
  }

  .eyebrow {
    display: block;
    margin-bottom: 0.25rem;
    color: #72e7ff;
    font-size: 0.64rem;
    font-weight: 750;
    letter-spacing: 0.22em;
  }

  .settings-header button {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    color: white;
    font-size: 1.35rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.75rem;
    cursor: pointer;
  }

  .settings-header button:hover,
  .settings-header button:focus-visible {
    background: rgba(255, 255, 255, 0.16);
    outline: none;
  }

  .settings-scroll {
    display: grid;
    gap: 1.25rem;
    padding: 1.25rem 1.35rem 1.5rem;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(113, 229, 255, 0.52) transparent;
  }

  .settings-section {
    display: grid;
    gap: 0.65rem;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.15rem 0 0.35rem;
  }

  .section-heading > :global(svg) {
    font-size: 1.35rem;
    color: #71e5ff;
  }

  .section-heading h3 {
    font-size: 1rem;
  }

  .section-heading p {
    margin-top: 0.13rem;
    font-size: 0.73rem;
    opacity: 0.62;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
    padding: 0.35rem;
    background: rgba(9, 20, 45, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.8rem;
  }

  .segmented button {
    min-height: 2.65rem;
    padding: 0.55rem 0.75rem;
    color: rgba(255, 255, 255, 0.74);
    font: inherit;
    font-size: 0.86rem;
    font-weight: 650;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.6rem;
    cursor: pointer;
  }

  .segmented button:hover {
    color: white;
    background: rgba(255, 255, 255, 0.07);
  }

  .segmented button.active {
    color: white;
    background: linear-gradient(
      120deg,
      rgba(49, 223, 241, 0.28),
      rgba(147, 116, 255, 0.28)
    );
    border-color: rgba(104, 230, 255, 0.68);
    box-shadow:
      0 0 0 2px rgba(83, 214, 255, 0.1),
      inset 0 1px rgba(255, 255, 255, 0.18);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    min-height: 3.7rem;
    padding: 0.72rem 0.9rem;
    color: white;
    font: inherit;
    text-align: left;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.78rem;
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease;
  }

  .setting-row:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .setting-row > span:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.16rem;
  }

  .setting-row strong {
    font-size: 0.88rem;
  }

  .setting-row small {
    font-size: 0.7rem;
    font-weight: 450;
    opacity: 0.58;
  }

  .switch {
    position: relative;
    flex: 0 0 auto;
    width: 2.55rem;
    height: 1.45rem;
    background: rgba(255, 255, 255, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    transition:
      background 180ms ease,
      border-color 180ms ease;
  }

  .switch i {
    position: absolute;
    top: 0.18rem;
    left: 0.18rem;
    width: 0.95rem;
    height: 0.95rem;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 7px rgba(5, 12, 30, 0.3);
    transition: transform 180ms ease;
  }

  .switch.on {
    background: linear-gradient(110deg, #2ad6ee, #8f82ff);
    border-color: rgba(117, 231, 255, 0.72);
  }

  .switch.on i {
    transform: translateX(1.08rem);
  }

  .slider-row {
    cursor: default;
  }

  .slider-row input {
    width: min(56%, 27rem);
    accent-color: #60dcf6;
    cursor: pointer;
  }

  @keyframes layer-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateY(1rem) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes engine-menu-in {
    from {
      opacity: 0;
      transform: translateY(-0.45rem) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-height: 760px) and (min-width: 720px) {
    .discover-stage {
      padding-top: 5.5rem;
    }
    .clock-block {
      margin-bottom: 1.5rem;
    }
    .quick-dock {
      margin-top: 2rem;
    }
  }

  @media (max-width: 720px) {
    .discover-stage {
      width: 100%;
      padding: 6rem 1rem 1.2rem;
    }

    .clock-block {
      margin-bottom: 2rem;
    }

    .search-wrap {
      width: min(100%, 34rem);
    }

    .discover-shell.search-active .search-wrap {
      transform: translateY(-2.5rem);
    }

    .discover-shell.search-active .clock-block {
      transform: translateY(-0.8rem);
    }

    .search-bar {
      grid-template-columns: 3rem 1fr 3rem;
      height: 3.4rem;
      border-radius: 1rem;
    }

    .search-bar input {
      font-size: 0.96rem;
    }

    .engine-menu {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      max-height: min(20rem, 44svh);
      overflow-y: auto;
    }

    .quick-dock {
      width: min(100%, calc(100vw - 4.8rem));
      margin-top: 3.5rem;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
    }

    .quick-dock a {
      min-width: 4.25rem;
    }

    .corner-actions {
      right: 0.75rem;
      bottom: 1rem;
    }

    .corner-actions a,
    .corner-actions button {
      width: 2.55rem;
      height: 2.55rem;
      font-size: 1.3rem;
    }

    .settings-layer {
      align-items: end;
      padding: 4.7rem 0.55rem 0.55rem;
    }

    .settings-panel {
      width: 100%;
      max-height: calc(100svh - 5.25rem);
      border-radius: 1.15rem;
    }

    .settings-header,
    .settings-scroll {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .segmented {
      grid-template-columns: 1fr;
    }

    .setting-row {
      min-height: 3.55rem;
    }

    .slider-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .slider-row input {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .discover-shell *,
    .discover-shell *::before,
    .discover-shell *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
