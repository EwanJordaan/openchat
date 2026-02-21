"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { type Chat, type ChatWithMessages } from "@/backend/domain/chat";
import {
  getCustomModelPreference,
  getModelPresetPreference,
  getModelProviderPreference,
  setCustomModelPreference,
  setModelPresetPreference,
  setModelProviderPreference,
} from "@/app/lib/model-provider";
import {
  ChatApiError,
  clearChatCache,
  fetchChatById,
  fetchChats,
  getCachedChatsSnapshot,
  streamAppendChatMessage,
  streamCreateChatFromMessage,
  streamGuestAssistantResponse,
} from "@/app/lib/chats";
import { fetchModelProviders, type ModelProviderAvailability } from "@/app/lib/model-providers-api";
import {
  OPENCHAT_MODEL_PROVIDER_OPTIONS,
  OPENCHAT_PROVIDER_DEFAULT_MODELS,
  OPENCHAT_PROVIDER_MODEL_PRESETS,
  resolveModelProviderId,
  type ModelProviderId,
} from "@/shared/model-providers";
import {
  clearCurrentUserCache,
  type CurrentUserData,
  fetchCurrentUser,
  getCachedCurrentUser,
  getDisplayName,
} from "@/app/lib/current-user";
import { getPublicSiteConfig } from "@/app/lib/site-config";
import { ProfileAvatar } from "@/components/profile-avatar";

type Role = "assistant" | "user" | "system";

type Message = {
  id: string;
  role: Role;
  content: string;
  time: string;
};

const publicSiteConfig = getPublicSiteConfig();

function getCurrentTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getDefaultProviderAvailability(): ModelProviderAvailability[] {
  return OPENCHAT_MODEL_PROVIDER_OPTIONS.map((providerOption) => ({
    ...providerOption,
    configured: true,
    defaultModel: OPENCHAT_PROVIDER_DEFAULT_MODELS[providerOption.id],
    models: OPENCHAT_PROVIDER_MODEL_PRESETS[providerOption.id],
  }));
}

function getDefaultModelPresetByProvider(
  providers: ModelProviderAvailability[],
): Partial<Record<ModelProviderId, string>> {
  const next: Partial<Record<ModelProviderId, string>> = {};

  for (const provider of providers) {
    next[provider.id] = provider.defaultModel;
  }

  return next;
}

function mapChatMessages(payload: ChatWithMessages): Message[] {
  const sortedMessages = [...payload.messages].sort((a, b) => {
    const leftTime = Date.parse(a.createdAt);
    const rightTime = Date.parse(b.createdAt);

    const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime;

    if (safeLeftTime !== safeRightTime) {
      return safeLeftTime - safeRightTime;
    }

    const rolePriority = getRolePriority(a.role) - getRolePriority(b.role);
    if (rolePriority !== 0) {
      return rolePriority;
    }

    return a.id.localeCompare(b.id);
  });

  return sortedMessages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    time: getCurrentTimeLabel(new Date(message.createdAt)),
  }));
}

function getRolePriority(role: Role): number {
  if (role === "user") {
    return 0;
  }

  if (role === "assistant") {
    return 1;
  }

  return 2;
}

function upsertChat(chats: Chat[], updatedChat: Chat): Chat[] {
  const next = [updatedChat, ...chats.filter((chat) => chat.id !== updatedChat.id)];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getChatIdFromPathname(pathname: string): string | null {
  if (!pathname.startsWith("/c/")) {
    return null;
  }

  const raw = pathname.slice(3).split("/")[0];
  if (!raw) {
    return null;
  }

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function resolveAccessTier(currentUser: CurrentUserData | null): "guest" | "member" | "admin" {
  if (!currentUser) {
    return "guest";
  }

  return currentUser.principal.roles.includes("admin") ? "admin" : "member";
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 2.5 14.7 8l5.8.8-4.2 4 1 5.7-5.3-2.8-5.3 2.8 1-5.7-4.2-4 5.8-.8L12 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 19a.75.75 0 0 1-.75-.75V7.56l-2.97 2.97a.75.75 0 1 1-1.06-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06l-2.97-2.97v10.69A.75.75 0 0 1 12 19Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
      <path
        d="M4 7.75h16a.75.75 0 0 0 0-1.5H4a.75.75 0 0 0 0 1.5Zm16 3.5H4a.75.75 0 0 0 0 1.5h16a.75.75 0 0 0 0-1.5Zm0 5H4a.75.75 0 0 0 0 1.5h16a.75.75 0 0 0 0-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 5.5v13m-6.5-6.5h13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.1 0-7.5 2.4-7.5 5.3 0 .4.34.7.75.7h13.5c.41 0 .75-.3.75-.7 0-2.9-3.4-5.3-7.5-5.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();

  const activeChatId = useMemo(() => getChatIdFromPathname(pathname), [pathname]);

  const [openMenuChatId, setOpenMenuChatId] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarContentVisible, setIsSidebarContentVisible] = useState(true);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [draft, setDraft] = useState("");
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [isChatListLoading, setIsChatListLoading] = useState(false);
  const [isActiveChatLoading, setIsActiveChatLoading] = useState(false);
  const [isActiveChatMissing, setIsActiveChatMissing] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserData | null>(null);
  const [selectedModelProvider, setSelectedModelProvider] = useState<ModelProviderId>(
    publicSiteConfig.ai.defaultModelProvider,
  );
  const [defaultModelProvider, setDefaultModelProvider] = useState<ModelProviderId>(
    publicSiteConfig.ai.defaultModelProvider,
  );
  const [allowUserModelProviderSelection, setAllowUserModelProviderSelection] = useState<boolean>(
    publicSiteConfig.ai.allowUserModelProviderSelection,
  );
  const [providerAvailability, setProviderAvailability] = useState<ModelProviderAvailability[]>(
    getDefaultProviderAvailability(),
  );
  const [openRouterRateLimits, setOpenRouterRateLimits] = useState({
    guestRequestsPerDay: 0,
    memberRequestsPerDay: 0,
    adminRequestsPerDay: 0,
  });
  const [modelPresetByProvider, setModelPresetByProvider] = useState<
    Partial<Record<ModelProviderId, string>>
  >(() => getDefaultModelPresetByProvider(getDefaultProviderAvailability()));
  const [customModelByProvider, setCustomModelByProvider] = useState<
    Partial<Record<ModelProviderId, string>>
  >({});
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const sidebarContentTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cachedProvider = getModelProviderPreference(publicSiteConfig.ai.defaultModelProvider);
    setSelectedModelProvider(cachedProvider);

    const defaultProviders = getDefaultProviderAvailability();

    setModelPresetByProvider(() => {
      const next: Partial<Record<ModelProviderId, string>> = {};
      for (const provider of defaultProviders) {
        next[provider.id] = getModelPresetPreference(provider.id, provider.defaultModel);
      }

      return next;
    });

    setCustomModelByProvider(() => {
      const next: Partial<Record<ModelProviderId, string>> = {};
      for (const provider of defaultProviders) {
        const customModel = getCustomModelPreference(provider.id);
        if (customModel) {
          next[provider.id] = customModel;
        }
      }

      return next;
    });
  }, []);

  useEffect(() => {
    let isDisposed = false;

    async function loadProviderAvailability() {
      try {
        const payload = await fetchModelProviders();
        if (isDisposed) {
          return;
        }

        setDefaultModelProvider(payload.defaultModelProvider);
        setAllowUserModelProviderSelection(payload.allowUserModelProviderSelection);
        setProviderAvailability(payload.providers);
        setOpenRouterRateLimits(payload.openrouterRateLimits);

        if (!payload.allowUserModelProviderSelection) {
          setSelectedModelProvider(payload.defaultModelProvider);
          setModelProviderPreference(payload.defaultModelProvider);
        }
      } catch {
        if (isDisposed) {
          return;
        }

        setAllowUserModelProviderSelection(publicSiteConfig.ai.allowUserModelProviderSelection);
        setProviderAvailability(getDefaultProviderAvailability());
      }
    }

    void loadProviderAvailability();

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (providerAvailability.length === 0) {
      return;
    }

    setModelPresetByProvider((previous) => {
      let didChange = false;
      const next: Partial<Record<ModelProviderId, string>> = { ...previous };

      for (const provider of providerAvailability) {
        const knownModels = new Set(provider.models.map((modelOption) => modelOption.id));
        const existing = next[provider.id]?.trim();
        if (existing && knownModels.has(existing)) {
          continue;
        }

        const stored = getModelPresetPreference(provider.id, provider.defaultModel);
        const resolved = knownModels.has(stored) ? stored : provider.defaultModel;
        if (next[provider.id] === resolved) {
          continue;
        }

        next[provider.id] = resolved;
        setModelPresetPreference(provider.id, resolved);
        didChange = true;
      }

      return didChange ? next : previous;
    });

    const selectedProviderOption = providerAvailability.find(
      (provider) => provider.id === selectedModelProvider,
    );

    if (!allowUserModelProviderSelection) {
      const enforcedProviderOption = providerAvailability.find(
        (provider) => provider.id === defaultModelProvider,
      );

      if (enforcedProviderOption?.configured) {
        setSelectedModelProvider(defaultModelProvider);
        setModelProviderPreference(defaultModelProvider);
        return;
      }
    }

    if (selectedProviderOption?.configured) {
      return;
    }

    const firstConfigured = providerAvailability.find((provider) => provider.configured);
    if (!firstConfigured) {
      return;
    }

    setSelectedModelProvider(firstConfigured.id);
    setModelProviderPreference(firstConfigured.id);
  }, [
    allowUserModelProviderSelection,
    defaultModelProvider,
    providerAvailability,
    selectedModelProvider,
  ]);

  useEffect(() => {
    let isDisposed = false;
    const cachedCurrentUser = getCachedCurrentUser();

    if (cachedCurrentUser !== undefined) {
      setCurrentUser(cachedCurrentUser);
      setIsAuthLoading(false);
      return () => {
        isDisposed = true;
      };
    }

    async function resolveSession() {
      try {
        const user = await fetchCurrentUser();

        if (isDisposed) {
          return;
        }

        setCurrentUser(user);
      } catch {
        if (isDisposed) {
          return;
        }

        setCurrentUser(null);
      } finally {
        if (!isDisposed) {
          setIsAuthLoading(false);
        }
      }
    }

    void resolveSession();

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (!target.closest("[data-history-menu]")) {
        setOpenMenuChatId(null);
      }

      if (!target.closest("[data-profile-menu]")) {
        setIsProfileMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuChatId(null);
        setIsProfileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarContentTimerRef.current !== null) {
        window.clearTimeout(sidebarContentTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const chatContainer = chatScrollRef.current;
    if (!chatContainer) {
      return;
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, [chatMessages, isAssistantTyping]);

  useEffect(() => {
    if (!currentUser) {
      setChats([]);
      return;
    }

    const userId = currentUser.user.id;
    const cachedChatList = getCachedChatsSnapshot(userId);
    if (cachedChatList !== undefined) {
      setChats(cachedChatList);
      setIsChatListLoading(false);
      return;
    }

    let isDisposed = false;

    async function loadChats() {
      setIsChatListLoading(true);

      try {
        const loadedChats = await fetchChats(userId);

        if (isDisposed) {
          return;
        }

        setChats(loadedChats);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        if (error instanceof ChatApiError && error.status === 401) {
          clearCurrentUserCache();
          clearChatCache();
          setCurrentUser(null);
          setChats([]);
          return;
        }

        setAuthNotice("Could not load chats right now.");
      } finally {
        if (!isDisposed) {
          setIsChatListLoading(false);
        }
      }
    }

    void loadChats();

    return () => {
      isDisposed = true;
    };
  }, [currentUser, pathname, router]);

  useEffect(() => {
    const requestedChatId = activeChatId;

    if (isAuthLoading) {
      return;
    }

    if (!requestedChatId) {
      setIsActiveChatMissing(false);
      setIsActiveChatLoading(false);
      setChatMessages([]);
      return;
    }

    if (!currentUser) {
      setIsActiveChatMissing(false);
      setIsActiveChatLoading(false);
      setChatMessages([]);
      return;
    }

    const chatId = requestedChatId;
    let isDisposed = false;

    async function loadActiveChat() {
      setIsActiveChatLoading(true);

      try {
        const activeChat = await fetchChatById(chatId);

        if (isDisposed) {
          return;
        }

        setChatMessages(mapChatMessages(activeChat));
        setChats((previous) => upsertChat(previous, activeChat.chat));
        setIsActiveChatMissing(false);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        if (error instanceof ChatApiError && error.status === 404) {
          setIsActiveChatMissing(true);
          setChatMessages([]);
          return;
        }

        if (error instanceof ChatApiError && error.status === 401) {
          clearCurrentUserCache();
          clearChatCache();
          setCurrentUser(null);
          setChats([]);
          setChatMessages([]);
          return;
        }

        setAuthNotice("Could not load this chat right now.");
      } finally {
        if (!isDisposed) {
          setIsActiveChatLoading(false);
        }
      }
    }

    void loadActiveChat();

    return () => {
      isDisposed = true;
    };
  }, [activeChatId, currentUser, isAuthLoading, pathname, router]);

  function toggleSidebar() {
    setOpenMenuChatId(null);
    setIsProfileMenuOpen(false);

    if (sidebarContentTimerRef.current !== null) {
      window.clearTimeout(sidebarContentTimerRef.current);
      sidebarContentTimerRef.current = null;
    }

    if (isSidebarCollapsed) {
      setIsSidebarContentVisible(false);
      setIsSidebarCollapsed(false);
      sidebarContentTimerRef.current = window.setTimeout(() => {
        setIsSidebarContentVisible(true);
        sidebarContentTimerRef.current = null;
      }, 210);
      return;
    }

    setIsSidebarContentVisible(false);
    setIsSidebarCollapsed(true);
  }

  function getActiveModel(providerId: ModelProviderId): string {
    const selectedProviderOption = providerAvailability.find((providerOption) => providerOption.id === providerId);
    const fallbackModel = selectedProviderOption?.defaultModel ?? OPENCHAT_PROVIDER_DEFAULT_MODELS[providerId];
    const selectedPresetModel = modelPresetByProvider[providerId]?.trim() || fallbackModel;
    if (providerId === "openrouter") {
      return selectedPresetModel;
    }

    const customModel = customModelByProvider[providerId]?.trim() ?? "";

    if (customModel.length > 0) {
      return customModel;
    }

    return selectedPresetModel;
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAssistantTyping || isActiveChatMissing || isActiveChatLoading) {
      return;
    }

    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    const selectedProviderOption = providerAvailability.find(
      (providerOption) => providerOption.id === selectedModelProvider,
    );
    const hasConfiguredProvider = providerAvailability.some((providerOption) => providerOption.configured);
    if (!hasConfiguredProvider) {
      setAuthNotice("No AI providers are configured. Add a provider key in admin settings.");
      return;
    }

    if (selectedProviderOption && !selectedProviderOption.configured) {
      const fallbackProviderOption = providerAvailability.find((providerOption) => providerOption.configured);
      if (!fallbackProviderOption) {
        setAuthNotice("No AI providers are configured. Add a provider key in admin settings.");
        return;
      }

      setSelectedModelProvider(fallbackProviderOption.id);
      setModelProviderPreference(fallbackProviderOption.id);
      setAuthNotice(`${fallbackProviderOption.label} is selected because your previous provider is unavailable.`);
      return;
    }

    const selectedModel = getActiveModel(selectedModelProvider);
    if (!selectedModel) {
      setAuthNotice("Select a model before sending your message.");
      return;
    }

    if (!currentUser) {
      if (!publicSiteConfig.features.allowGuestResponses) {
        setAuthNotice("Sign in to send messages and save chats.");
        return;
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmedDraft,
        time: getCurrentTimeLabel(),
      };
      const assistantMessageId = crypto.randomUUID();
      const streamingAssistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        time: getCurrentTimeLabel(),
      };

      const previousMessages = chatMessages;
      setChatMessages((previous) => [...previous, userMessage, streamingAssistantMessage]);
      setDraft("");
      setIsAssistantTyping(true);

      try {
        await streamGuestAssistantResponse(
          trimmedDraft,
          selectedModelProvider,
          selectedModel,
          (chunk) => {
            setChatMessages((previous) =>
              previous.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `${message.content}${chunk}`,
                    }
                  : message,
              ),
            );
          },
        );
      } catch (error) {
        setChatMessages(previousMessages);
        setDraft(trimmedDraft);
        setAuthNotice(error instanceof Error ? error.message : "Could not send message.");
      } finally {
        setIsAssistantTyping(false);
      }

      return;
    }

    const optimisticMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedDraft,
      time: getCurrentTimeLabel(),
    };
    const assistantMessageId = crypto.randomUUID();
    const streamingAssistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      time: getCurrentTimeLabel(),
    };

    const previousMessages = chatMessages;
    setChatMessages((previous) => [...previous, optimisticMessage, streamingAssistantMessage]);
    setDraft("");
    setIsAssistantTyping(true);
    setAuthNotice(null);

    try {
      if (!activeChatId) {
        const createdChat = await streamCreateChatFromMessage(
          trimmedDraft,
          selectedModelProvider,
          selectedModel,
          (chunk) => {
            setChatMessages((previous) =>
              previous.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `${message.content}${chunk}`,
                    }
                  : message,
              ),
            );
          },
        );
        setChats((previous) => upsertChat(previous, createdChat.chat));
        setChatMessages(mapChatMessages(createdChat));
        router.push(`/c/${createdChat.chat.id}`);
        return;
      }

      const targetChatId = activeChatId;
      const updatedChat = await streamAppendChatMessage(
        targetChatId,
        trimmedDraft,
        selectedModelProvider,
        selectedModel,
        (chunk) => {
          setChatMessages((previous) =>
            previous.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: `${message.content}${chunk}`,
                  }
                : message,
            ),
          );
        },
      );
      setChats((previous) => upsertChat(previous, updatedChat.chat));
      setChatMessages(mapChatMessages(updatedChat));
    } catch (error) {
      setChatMessages(previousMessages);
      setDraft(trimmedDraft);

      if (error instanceof ChatApiError && error.status === 404) {
        setIsActiveChatMissing(true);
      }

      if (error instanceof ChatApiError && error.status === 401) {
        clearCurrentUserCache();
        clearChatCache();
        setCurrentUser(null);
        setChats([]);
      }

      setAuthNotice(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setIsAssistantTyping(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
      });
    } finally {
      clearCurrentUserCache();
      clearChatCache();
      setCurrentUser(null);
      setChats([]);
      setChatMessages([]);
      setIsProfileMenuOpen(false);
      setAuthNotice("Signed out. Sign in again to access account features.");
      router.push("/");
    }
  }

  function handleModelProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!allowUserModelProviderSelection) {
      return;
    }

    const nextProvider = resolveModelProviderId(event.target.value, defaultModelProvider);
    const nextProviderOption = providerAvailability.find((providerOption) => providerOption.id === nextProvider);
    if (nextProviderOption && !nextProviderOption.configured) {
      setAuthNotice(`${nextProviderOption.label} is not configured in admin settings.`);
      return;
    }

    setSelectedModelProvider(nextProvider);
    setModelProviderPreference(nextProvider);

    const resolvedPreset =
      modelPresetByProvider[nextProvider] ??
      nextProviderOption?.defaultModel ??
      OPENCHAT_PROVIDER_DEFAULT_MODELS[nextProvider];
    setModelPresetByProvider((previous) => ({
      ...previous,
      [nextProvider]: resolvedPreset,
    }));
    setModelPresetPreference(nextProvider, resolvedPreset);

    setAuthNotice(null);
  }

  function handleModelPresetChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextModel = event.target.value;
    setModelPresetByProvider((previous) => ({
      ...previous,
      [selectedModelProvider]: nextModel,
    }));
    setModelPresetPreference(selectedModelProvider, nextModel);
    setAuthNotice(null);
  }

  function handleCustomModelChange(event: ChangeEvent<HTMLInputElement>) {
    const nextModel = event.target.value;
    setCustomModelByProvider((previous) => ({
      ...previous,
      [selectedModelProvider]: nextModel,
    }));
    setCustomModelPreference(selectedModelProvider, nextModel);
  }

  const userDisplayName = currentUser
    ? getDisplayName(currentUser.user.name, currentUser.user.email)
    : "Guest";

  const selectedProviderOption = providerAvailability.find(
    (providerOption) => providerOption.id === selectedModelProvider,
  );
  const selectedProviderModels = selectedProviderOption?.models ?? [];
  const accessTier = resolveAccessTier(currentUser);
  const openRouterLimitForTier =
    accessTier === "admin"
      ? openRouterRateLimits.adminRequestsPerDay
      : accessTier === "member"
        ? openRouterRateLimits.memberRequestsPerDay
        : openRouterRateLimits.guestRequestsPerDay;
  const selectedPresetModel =
    modelPresetByProvider[selectedModelProvider] ??
    selectedProviderOption?.defaultModel ??
    OPENCHAT_PROVIDER_DEFAULT_MODELS[selectedModelProvider];
  const customModelDraft = customModelByProvider[selectedModelProvider] ?? "";
  const allowCustomModelInput = selectedModelProvider !== "openrouter";
  const activeModel = getActiveModel(selectedModelProvider);

  const configuredProviderOptions = providerAvailability.filter((providerOption) => providerOption.configured);
  const hasConfiguredProvider = configuredProviderOptions.length > 0;

  const composerDisabled =
    isAssistantTyping ||
    isActiveChatLoading ||
    isActiveChatMissing ||
    !hasConfiguredProvider ||
    activeModel.trim().length === 0 ||
    (!currentUser && !publicSiteConfig.features.allowGuestResponses);

  const latestMessage = chatMessages[chatMessages.length - 1];
  const showTypingIndicator =
    isAssistantTyping &&
    (latestMessage?.role !== "assistant" || (latestMessage.content?.length ?? 0) === 0);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-root)] text-[var(--text-primary)]">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <main className="app-shell relative mx-auto flex h-screen w-full">
        <aside
          className={`workspace-sidebar surface relative z-[60] hidden shrink-0 flex-col overflow-visible transition-[width] duration-200 md:flex ${
            isSidebarCollapsed ? "w-14" : "w-72"
          }`}
        >
          <div className="border-b border-white/10 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={toggleSidebar}
                className="group/toggle brand-chip relative h-8 w-8 shrink-0 border border-white/20 p-0 text-slate-100 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/toggle:opacity-0 group-focus-visible/toggle:opacity-0">
                  <SparkIcon />
                </span>
                <span className="absolute inset-0 flex items-center justify-center text-slate-950 opacity-0 transition-opacity duration-150 group-hover/toggle:opacity-100 group-focus-visible/toggle:opacity-100">
                  <MenuIcon />
                </span>
              </button>
              <div className={isSidebarContentVisible ? "block" : "hidden"}>
                <p className="text-sm font-semibold tracking-wide">OpenChat</p>
              </div>
            </div>

            {isSidebarContentVisible ? (
              <Link
                href="/"
                onClick={() => {
                  setOpenMenuChatId(null);
                  setIsActiveChatMissing(false);
                }}
                className="new-chat-button mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-primary)]/55 bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110"
              >
                <PlusIcon />
                <span className="whitespace-nowrap">New chat</span>
              </Link>
            ) : (
              <div className="mt-3 flex justify-center">
                <Link
                  href="/"
                  aria-label="New chat"
                  onClick={() => {
                    setOpenMenuChatId(null);
                    setIsActiveChatMissing(false);
                  }}
                  className="new-chat-button inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--accent-primary)]/60 bg-transparent text-[var(--accent-primary)] transition hover:bg-[var(--accent-primary)]/12 hover:text-[var(--accent-primary-strong)]"
                >
                  <PlusIcon />
                </Link>
              </div>
            )}
          </div>

          {isSidebarContentVisible ? (
            <div className="chat-history-list scrollbar-chat flex-1 space-y-2 overflow-y-auto p-3">
              {chats.length === 0 ? (
                currentUser ? (
                  isChatListLoading ? null : (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--text-muted)]">
                      No chats yet. Start with your first message.
                    </div>
                  )
                ) : isAuthLoading ? null : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--text-muted)]">
                    Sign in to view your chats.
                  </div>
                )
              ) : (
                chats.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const isMenuOpen = openMenuChatId === chat.id;

                  return (
                    <div
                      key={chat.id}
                      data-history-menu
                      className={`group/history relative ${isMenuOpen ? "z-30" : "z-0"}`}
                    >
                      <Link
                        href={`/c/${encodeURIComponent(chat.id)}`}
                        data-active={isActive ? "true" : "false"}
                        className="chat-history-link block w-full px-3 py-2 pr-11 text-left"
                      >
                        <p className="truncate text-sm font-medium">{chat.title}</p>
                      </Link>

                      <div className="absolute right-1 top-1/2 -translate-y-1/2">
                        <button
                          type="button"
                          aria-label={`Open menu for ${chat.title}`}
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          onClick={() => setOpenMenuChatId(isMenuOpen ? null : chat.id)}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-[var(--bg-root)] text-sm leading-none transition hover:text-[var(--text-primary)] ${
                            isMenuOpen
                              ? "pointer-events-auto text-[var(--text-primary)] opacity-100"
                              : "pointer-events-none text-[var(--text-dim)] opacity-0 group-hover/history:pointer-events-auto group-hover/history:opacity-100 group-focus-within/history:pointer-events-auto group-focus-within/history:opacity-100"
                          }`}
                        >
                          ...
                        </button>

                        <div
                          role="menu"
                          aria-label={`Actions for ${chat.title}`}
                          className={`absolute right-0 top-full z-30 mt-1 w-32 rounded-lg border border-white/12 bg-[var(--bg-root)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition ${
                            isMenuOpen
                              ? "pointer-events-auto visible translate-y-0 opacity-100"
                              : "pointer-events-none invisible translate-y-1 opacity-0"
                          }`}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setOpenMenuChatId(null)}
                            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-primary)]/18 hover:text-[var(--accent-primary-strong)]"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div
            className={`relative z-[70] mt-auto border-t border-white/10 ${isSidebarCollapsed ? "p-1.5" : "p-2"}`}
            data-profile-menu
          >
            {authNotice && isSidebarContentVisible ? (
              <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-[color:var(--text-muted)]">
                {authNotice}
              </div>
            ) : null}

            {currentUser ? (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Open profile menu"
                  aria-haspopup="menu"
                  aria-expanded={isProfileMenuOpen}
                  onClick={() => setIsProfileMenuOpen((previous) => !previous)}
                  className={`rounded-xl border border-white/12 bg-white/[0.03] transition hover:border-white/20 ${
                    isSidebarCollapsed
                      ? "mx-auto flex h-10 w-10 items-center justify-center rounded-full"
                      : "flex w-full items-center gap-2 p-1.5"
                  }`}
                >
                  <ProfileAvatar
                    name={currentUser.user.name}
                    email={currentUser.user.email}
                    hasAvatar={currentUser.user.hasAvatar}
                    avatarUpdatedAt={currentUser.user.avatarUpdatedAt}
                    sizeClassName="h-8 w-8"
                    textClassName="text-xs"
                  />
                  {!isSidebarCollapsed ? (
                    <span className="truncate text-left text-xs font-medium text-[color:var(--text-primary)]">
                      {getDisplayName(currentUser.user.name, currentUser.user.email)}
                    </span>
                  ) : null}
                </button>

                <div
                  role="menu"
                  aria-label="Profile actions"
                  className={`absolute z-[80] w-40 space-y-1 rounded-xl border border-white/12 bg-[var(--bg-root)] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.45)] transition ${
                    isSidebarCollapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 mb-2"
                  } ${
                    isProfileMenuOpen
                      ? "pointer-events-auto visible translate-y-0 opacity-100"
                      : "pointer-events-none invisible translate-y-1 opacity-0"
                  }`}
                >
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="block w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-primary)]/16 hover:text-[var(--accent-primary-strong)]"
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      void handleLogout();
                    }}
                    className="w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-secondary)]/20 hover:text-[var(--accent-secondary-strong)]"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href={`/login?returnTo=${encodeURIComponent(pathname)}`}
                aria-label="Login"
                className={`rounded-xl border border-white/12 bg-white/[0.03] text-xs font-medium text-[color:var(--text-primary)] transition hover:border-white/20 ${
                  isSidebarCollapsed
                    ? "mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full"
                    : "inline-flex w-full items-center justify-center p-1.5"
                }`}
              >
                {isSidebarCollapsed ? <UserIcon /> : "Login"}
              </Link>
            )}
          </div>
        </aside>

        <section className="workspace-main surface relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 sm:px-5 sm:py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{userDisplayName}</p>
              <p className="truncate text-xs text-[color:var(--text-dim)]">
                {isActiveChatMissing
                  ? "Chat not found"
                  : activeChatId
                    ? "Saved chat"
                    : currentUser
                      ? "New chat"
                      : "Browsing in guest mode"}
              </p>
            </div>
          </header>

          <div
            ref={chatScrollRef}
            className="scrollbar-chat flex-1 space-y-4 overflow-y-auto px-3 py-4 pb-24 sm:px-5 sm:py-5 sm:pb-28"
          >
            {isActiveChatMissing ? (
              <article className="mx-auto max-w-md rounded-2xl border border-white/12 bg-white/[0.03] p-5 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Chat not found</p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  This chat does not exist, or you do not have access to it.
                </p>
                <Link
                  href="/"
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-[var(--accent-primary)]/55 bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110"
                >
                  New chat
                </Link>
              </article>
            ) : isActiveChatLoading ? (
              null
            ) : chatMessages.length === 0 ? null : (
              chatMessages.map((message, index) => {
                const isUser = message.role === "user";

                return (
                  <article
                    key={message.id}
                    className={`message-enter flex ${isUser ? "justify-end" : "justify-start"}`}
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div
                      className={`max-w-[85%] px-1 py-1 sm:max-w-[75%] ${
                        isUser
                          ? "message-user-bubble rounded-2xl border border-[var(--accent-secondary)]/45 bg-[var(--accent-secondary)]/16 px-4 py-3"
                          : ""
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-primary)]">{message.content}</p>
                      ) : (
                        <div className="markdown-content text-sm leading-6 text-[var(--text-primary)]">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-[var(--text-dim)]">{message.time}</p>
                    </div>
                  </article>
                );
              })
            )}

            {showTypingIndicator ? (
              <article className="message-enter flex" style={{ animationDelay: "120ms" }}>
                <div className="flex items-center gap-1 px-2 py-3">
                  <span className="typing-dot" />
                  <span className="typing-dot [animation-delay:150ms]" />
                  <span className="typing-dot [animation-delay:300ms]" />
                </div>
              </article>
            ) : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-5 sm:pb-4">
            <div className="pointer-events-auto mb-2 rounded-lg border border-white/12 bg-[var(--bg-root)]/95 px-2.5 py-2 backdrop-blur">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
                <label className="flex min-w-0 items-center gap-2" htmlFor="chat-model-provider">
                  <span className="w-14 shrink-0 text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-dim)]">
                    Provider
                  </span>
                  <select
                    id="chat-model-provider"
                    value={selectedModelProvider}
                    onChange={handleModelProviderChange}
                    className="ai-select min-w-0 flex-1 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1.5 text-xs text-[color:var(--text-primary)] outline-none disabled:opacity-70"
                    disabled={
                      isAssistantTyping ||
                      providerAvailability.length === 0 ||
                      !allowUserModelProviderSelection
                    }
                  >
                    {providerAvailability.map((providerOption) => (
                      <option key={providerOption.id} value={providerOption.id} disabled={!providerOption.configured}>
                        {providerOption.configured
                          ? providerOption.label
                          : `${providerOption.label} (Not configured)`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-0 items-center gap-2" htmlFor="chat-model-preset">
                  <span className="w-14 shrink-0 text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-dim)]">
                    Model
                  </span>
                  <select
                    id="chat-model-preset"
                    value={selectedPresetModel}
                    onChange={handleModelPresetChange}
                    className="ai-select min-w-0 flex-1 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1.5 text-xs text-[color:var(--text-primary)] outline-none disabled:opacity-70"
                    disabled={isAssistantTyping || selectedProviderModels.length === 0}
                  >
                    {selectedProviderModels.map((modelOption) => (
                      <option key={modelOption.id} value={modelOption.id}>
                        {modelOption.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-0 items-center gap-2" htmlFor="chat-custom-model">
                  <span className="w-14 shrink-0 text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-dim)]">
                    Custom
                  </span>
                  <input
                    id="chat-custom-model"
                    type="text"
                    value={customModelDraft}
                    onChange={handleCustomModelChange}
                    placeholder={allowCustomModelInput ? "Optional model id" : "Admin-managed for OpenRouter"}
                    className="min-w-0 flex-1 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1.5 text-xs text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] disabled:opacity-70"
                    disabled={isAssistantTyping || !allowCustomModelInput}
                  />
                </label>
              </div>

              <p className="mt-1.5 text-[11px] text-[color:var(--text-dim)]">
                {!allowUserModelProviderSelection
                  ? `Provider is managed by admin policy (${selectedProviderOption?.label ?? selectedModelProvider}).`
                  : `${selectedProviderOption?.label ?? "Provider"} selected for this message.`}
                {selectedModelProvider === "openrouter"
                  ? ` ${accessTier} daily request limit: ${openRouterLimitForTier}.`
                  : ""}
              </p>
            </div>

            <form
              onSubmit={handleSendMessage}
              className="composer-shell pointer-events-auto flex items-center gap-1 rounded-lg border border-white/12 bg-[var(--bg-root)] px-1.5 py-1"
            >
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-dim)] transition hover:text-[var(--accent-primary-strong)]"
              >
                +
              </button>
              <input
                type="text"
                className="peer h-7 flex-1 bg-transparent px-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)] disabled:cursor-not-allowed disabled:opacity-70"
                placeholder={
                  !currentUser && !publicSiteConfig.features.allowGuestResponses
                    ? "Sign in to send messages..."
                    : "Ask OpenChat to draft, summarize, or brainstorm..."
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={composerDisabled}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={composerDisabled || draft.trim().length === 0}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--send-button-bg)] text-[var(--send-button-fg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
