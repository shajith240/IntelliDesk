"use client";

// Shell state: sidebar collapse, mobile nav, command palette, and keyboard shortcuts dialogs. Syncs sidebar to localStorage.
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "intellidesk.sidebar";

type SidebarValue = "collapsed" | "expanded";

function readSidebarStorage(): SidebarValue {
	try {
		const value = window.localStorage.getItem(STORAGE_KEY);
		return value === "collapsed" ? "collapsed" : "expanded";
	} catch {
		// localStorage can throw in private mode / disabled storage; fall back to default.
		return "expanded";
	}
}

function writeSidebarStorage(value: SidebarValue) {
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		// Best-effort persistence only; ignore write failures (private mode, quota, etc).
	}
}

const sidebarListeners = new Set<() => void>();
let sidebarSnapshot: SidebarValue | null = null;

function getSidebarSnapshot(): SidebarValue {
	if (sidebarSnapshot === null) {
		sidebarSnapshot = readSidebarStorage();
	}
	return sidebarSnapshot;
}

function getServerSidebarSnapshot(): SidebarValue {
	return "expanded";
}

function setSidebarValue(value: SidebarValue) {
	sidebarSnapshot = value;
	writeSidebarStorage(value);
	sidebarListeners.forEach((listener) => listener());
}

function subscribeSidebar(listener: () => void) {
	sidebarListeners.add(listener);
	const onStorage = (e: StorageEvent) => {
		if (e.key === STORAGE_KEY) {
			sidebarSnapshot = null;
			listener();
		}
	};
	window.addEventListener("storage", onStorage);
	return () => {
		sidebarListeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}

interface ShellContextValue {
	sidebarCollapsed: boolean;
	toggleSidebar: () => void;
	mobileNavOpen: boolean;
	setMobileNavOpen: (open: boolean) => void;
	paletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	shortcutsOpen: boolean;
	setShortcutsOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
	const sidebarValue = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, getServerSidebarSnapshot);
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);

	const toggleSidebar = useCallback(() => {
		const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
		if (isDesktop) {
			setSidebarValue(sidebarSnapshot === "collapsed" ? "expanded" : "collapsed");
		} else {
			setMobileNavOpen((open) => !open);
		}
	}, []);

	const value = useMemo<ShellContextValue>(
		() => ({
			sidebarCollapsed: sidebarValue === "collapsed",
			toggleSidebar,
			mobileNavOpen,
			setMobileNavOpen,
			paletteOpen,
			setPaletteOpen,
			shortcutsOpen,
			setShortcutsOpen,
		}),
		[sidebarValue, toggleSidebar, mobileNavOpen, paletteOpen, shortcutsOpen],
	);

	return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
	const ctx = useContext(ShellContext);
	if (!ctx) throw new Error("useShell must be used within a ShellProvider");
	return ctx;
}
