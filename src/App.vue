<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  createItem,
  deleteItem,
  fetchMe,
  fetchMeta,
  listItems,
  login,
  logout,
  register,
  updateItem,
  type Item,
  type LocaleCode,
  type User,
} from "./api/client";

type AuthMode = "login" | "register";
type APIState = "idle" | "loading" | "ready" | "error";
type ItemFilter = "all" | "reminders" | "notes" | "recent";

const authTokenKey = "auth_token";
const { locale, t } = useI18n();

const authMode = ref<AuthMode>("register");
const metaState = ref<APIState>("idle");
const sessionState = ref<APIState>("idle");
const itemsState = ref<APIState>("idle");
const authError = ref("");
const authSuccess = ref("");
const itemError = ref("");
const itemSuccess = ref("");
const apiLang = ref<LocaleCode>("ru");
const token = ref(window.localStorage.getItem(authTokenKey) ?? "");
const currentUser = ref<User | null>(null);
const items = ref<Item[]>([]);
const itemFilter = ref<ItemFilter>("all");
const editingItemID = ref("");
const deletingItemID = ref("");

const authForm = reactive({
  name: "",
  email: "",
  password: "",
});

const itemForm = reactive({
  title: "",
  body: "",
  remindAt: "",
  deliverToTelegram: false,
});

const editForm = reactive({
  title: "",
  body: "",
  remindAt: "",
  deliverToTelegram: false,
});

const isAuthenticated = computed(() => token.value !== "" && currentUser.value !== null);
const isRegisterMode = computed(() => authMode.value === "register");

const filteredItems = computed(() => {
  const base = items.value.filter((item) => !item.deleted_at);
  const now = Date.now();

  switch (itemFilter.value) {
    case "reminders":
      return base.filter((item) => Boolean(item.remind_at));
    case "notes":
      return base.filter((item) => !item.remind_at);
    case "recent":
      return base.filter((item) => now - new Date(item.updated_at).getTime() <= 24 * 60 * 60 * 1000);
    default:
      return base;
  }
});

const syncSummary = computed(() => {
  const reminders = items.value.filter((item) => item.remind_at && !item.deleted_at).length;
  const notes = items.value.filter((item) => !item.remind_at && !item.deleted_at).length;

  return {
    total: items.value.filter((item) => !item.deleted_at).length,
    reminders,
    notes,
  };
});

async function loadMeta() {
  metaState.value = "loading";

  try {
    const meta = await fetchMeta();
    apiLang.value = meta.default_language;
    metaState.value = "ready";
  } catch {
    metaState.value = "error";
  }
}

function setLocale(nextLocale: LocaleCode) {
  locale.value = nextLocale;
  window.localStorage.setItem("locale", nextLocale);
}

function saveToken(nextToken: string) {
  token.value = nextToken;

  if (nextToken) {
    window.localStorage.setItem(authTokenKey, nextToken);
    return;
  }

  window.localStorage.removeItem(authTokenKey);
}

async function restoreSession() {
  if (!token.value) {
    sessionState.value = "idle";
    return;
  }

  sessionState.value = "loading";
  authError.value = "";

  try {
    const response = await fetchMe(token.value);
    currentUser.value = response.user;
    sessionState.value = "ready";
    setLocale(response.user.lang);
    await loadItems();
  } catch (error) {
    saveToken("");
    currentUser.value = null;
    items.value = [];
    sessionState.value = "error";
    authError.value = errorMessage(error);
  }
}

function validateAuthForm() {
  authError.value = "";

  if (isRegisterMode.value && authForm.name.trim().length < 2) {
    authError.value = t("app.validation.name");
    return false;
  }

  if (!/^\S+@\S+\.\S+$/.test(authForm.email.trim())) {
    authError.value = t("app.validation.email");
    return false;
  }

  if (authForm.password.length < 8) {
    authError.value = t("app.validation.password");
    return false;
  }

  return true;
}

function validateItemForm(title: string, remindAt: string) {
  itemError.value = "";

  if (title.trim().length < 2) {
    itemError.value = t("app.validation.itemTitle");
    return false;
  }

  if (remindAt && Number.isNaN(new Date(remindAt).getTime())) {
    itemError.value = t("app.validation.remindAt");
    return false;
  }

  return true;
}

async function submitAuth() {
  if (!validateAuthForm()) {
    return;
  }

  sessionState.value = "loading";
  authError.value = "";
  authSuccess.value = "";

  try {
    if (isRegisterMode.value) {
      const response = await register({
        name: authForm.name.trim(),
        email: authForm.email.trim(),
        password: authForm.password,
        lang: locale.value as LocaleCode,
      });

      saveToken(response.access_token);
      currentUser.value = response.user;
      setLocale(response.user.lang);
      authSuccess.value = t("app.registered");
    } else {
      const response = await login({
        email: authForm.email.trim(),
        password: authForm.password,
      });

      saveToken(response.access_token);
      currentUser.value = response.user;
      setLocale(response.user.lang);
      authSuccess.value = t("app.loggedIn");
    }

    authForm.password = "";
    sessionState.value = "ready";
    await loadItems();
  } catch (error) {
    sessionState.value = "error";
    authError.value = errorMessage(error);
  }
}

async function submitItem() {
  if (!token.value || !validateItemForm(itemForm.title, itemForm.remindAt)) {
    return;
  }

  itemsState.value = "loading";
  itemError.value = "";
  itemSuccess.value = "";

  try {
    const response = await createItem(token.value, {
      title: itemForm.title.trim(),
      body: itemForm.body.trim(),
      lang: locale.value as LocaleCode,
      status: "active",
      remind_at: itemForm.remindAt ? new Date(itemForm.remindAt).toISOString() : null,
      deliver_to_telegram: itemForm.deliverToTelegram,
      source: "web",
    });

    items.value = [response.item, ...items.value];
    itemForm.title = "";
    itemForm.body = "";
    itemForm.remindAt = "";
    itemForm.deliverToTelegram = false;
    itemsState.value = "ready";
    itemSuccess.value = t("app.itemCreated");
  } catch (error) {
    itemsState.value = "error";
    itemError.value = errorMessage(error);
  }
}

async function loadItems() {
  if (!token.value) {
    items.value = [];
    itemsState.value = "idle";
    return;
  }

  itemsState.value = "loading";
  itemError.value = "";

  try {
    const response = await listItems(token.value);
    items.value = response.items.filter((item) => !item.deleted_at);
    itemsState.value = "ready";
  } catch (error) {
    itemsState.value = "error";
    itemError.value = errorMessage(error);
  }
}

function startEdit(item: Item) {
  editingItemID.value = item.id;
  itemSuccess.value = "";
  itemError.value = "";
  editForm.title = item.title;
  editForm.body = item.body;
  editForm.remindAt = toDateTimeLocal(item.remind_at);
  editForm.deliverToTelegram = item.deliver_to_telegram;
}

function cancelEdit() {
  editingItemID.value = "";
}

async function saveEdit(item: Item) {
  if (!token.value || !validateItemForm(editForm.title, editForm.remindAt)) {
    return;
  }

  itemsState.value = "loading";
  itemSuccess.value = "";

  try {
    const response = await updateItem(token.value, item.id, {
      title: editForm.title.trim(),
      body: editForm.body.trim(),
      lang: locale.value as LocaleCode,
      remind_at: editForm.remindAt ? new Date(editForm.remindAt).toISOString() : null,
      deliver_to_telegram: editForm.deliverToTelegram,
      source: "web",
    });

    items.value = items.value.map((entry) => (entry.id === item.id ? response.item : entry));
    editingItemID.value = "";
    itemsState.value = "ready";
    itemSuccess.value = t("app.itemUpdated");
  } catch (error) {
    itemsState.value = "error";
    itemError.value = errorMessage(error);
  }
}

async function removeItem(item: Item) {
  if (!token.value) {
    return;
  }

  deletingItemID.value = item.id;
  itemError.value = "";
  itemSuccess.value = "";

  try {
    await deleteItem(token.value, item.id);
    items.value = items.value.filter((entry) => entry.id !== item.id);
    itemSuccess.value = t("app.itemDeleted");
  } catch (error) {
    itemError.value = errorMessage(error);
  } finally {
    deletingItemID.value = "";
  }
}

async function logoutCurrentUser() {
  if (!token.value) {
    return;
  }

  try {
    await logout(token.value);
  } catch {
    // Clear the local session even if the API logout fails.
  }

  saveToken("");
  currentUser.value = null;
  items.value = [];
  sessionState.value = "idle";
  authSuccess.value = "";
  itemSuccess.value = "";
}

function switchMode(mode: AuthMode) {
  authMode.value = mode;
  authError.value = "";
  authSuccess.value = "";
}

function formatDate(value?: string | null) {
  if (!value) {
    return t("app.noReminder");
  }

  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return t("app.unknownError");
}

onMounted(() => {
  void loadMeta();
  void restoreSession();
});
</script>

<template>
  <main class="shell">
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">{{ t("app.badge") }}</p>
          <h1>{{ t("app.title") }}</h1>
          <p class="lead">{{ t("app.subtitle") }}</p>
        </div>

        <div class="actions">
          <button :class="{ active: locale === 'ru' }" @click="setLocale('ru')">RU</button>
          <button :class="{ active: locale === 'en' }" @click="setLocale('en')">EN</button>
        </div>
      </div>

      <div class="status-row">
        <span class="pill" :class="metaState">{{ t(`app.meta.${metaState}`) }}</span>
        <span class="pill neutral">{{ t("app.defaultLang") }}: {{ apiLang }}</span>
        <span class="pill neutral">{{ t("app.totalItems") }}: {{ syncSummary.total }}</span>
        <span class="pill neutral">{{ t("app.totalReminders") }}: {{ syncSummary.reminders }}</span>
        <span class="pill neutral">{{ t("app.totalNotes") }}: {{ syncSummary.notes }}</span>
        <span v-if="currentUser" class="pill warm">{{ currentUser.email }}</span>
      </div>
    </section>

    <section class="layout">
      <section class="card auth-card">
        <div class="card-head">
          <h2>{{ t("app.authTitle") }}</h2>
          <div class="segmented">
            <button :class="{ active: authMode === 'register' }" @click="switchMode('register')">
              {{ t("app.register") }}
            </button>
            <button :class="{ active: authMode === 'login' }" @click="switchMode('login')">
              {{ t("app.login") }}
            </button>
          </div>
        </div>

        <div v-if="!isAuthenticated" class="form-stack">
          <label v-if="isRegisterMode" class="field">
            <span>{{ t("app.name") }}</span>
            <input v-model="authForm.name" type="text" :placeholder="t('app.namePlaceholder')" />
          </label>

          <label class="field">
            <span>{{ t("app.email") }}</span>
            <input v-model="authForm.email" type="email" placeholder="alex@example.com" />
          </label>

          <label class="field">
            <span>{{ t("app.password") }}</span>
            <input v-model="authForm.password" type="password" :placeholder="t('app.passwordPlaceholder')" />
          </label>

          <p v-if="authError" class="feedback error">{{ authError }}</p>
          <p v-if="authSuccess" class="feedback success">{{ authSuccess }}</p>

          <button class="primary" :disabled="sessionState === 'loading'" @click="submitAuth">
            {{ isRegisterMode ? t("app.registerAction") : t("app.loginAction") }}
          </button>
        </div>

        <div v-else class="profile">
          <p class="profile-name">{{ currentUser?.name }}</p>
          <p>{{ currentUser?.email }}</p>
          <p>{{ t("app.profileLang") }}: {{ currentUser?.lang }}</p>
          <p>{{ t("app.syncHint") }}</p>
          <button class="ghost" @click="logoutCurrentUser">{{ t("app.logout") }}</button>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>{{ t("app.newItemTitle") }}</h2>
          <span class="subtle">{{ t("app.newItemHint") }}</span>
        </div>

        <div class="form-stack">
          <label class="field">
            <span>{{ t("app.itemTitle") }}</span>
            <input
              v-model="itemForm.title"
              type="text"
              :placeholder="t('app.itemTitlePlaceholder')"
              :disabled="!isAuthenticated"
            />
          </label>

          <label class="field">
            <span>{{ t("app.itemBody") }}</span>
            <textarea
              v-model="itemForm.body"
              rows="4"
              :placeholder="t('app.itemBodyPlaceholder')"
              :disabled="!isAuthenticated"
            />
          </label>

          <label class="field">
            <span>{{ t("app.remindAt") }}</span>
            <input v-model="itemForm.remindAt" type="datetime-local" :disabled="!isAuthenticated" />
          </label>

          <label class="checkbox">
            <input v-model="itemForm.deliverToTelegram" type="checkbox" :disabled="!isAuthenticated" />
            <span>{{ t("app.deliverToTelegram") }}</span>
          </label>

          <p v-if="itemError" class="feedback error">{{ itemError }}</p>
          <p v-if="itemSuccess" class="feedback success">{{ itemSuccess }}</p>
          <p v-if="!isAuthenticated" class="feedback">{{ t("app.authRequired") }}</p>

          <button class="primary" :disabled="!isAuthenticated || itemsState === 'loading'" @click="submitItem">
            {{ t("app.createItem") }}
          </button>
        </div>
      </section>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>{{ t("app.itemsTitle") }}</h2>
        <div class="toolbar">
          <select v-model="itemFilter" class="select">
            <option value="all">{{ t("app.filterAll") }}</option>
            <option value="reminders">{{ t("app.filterReminders") }}</option>
            <option value="notes">{{ t("app.filterNotes") }}</option>
            <option value="recent">{{ t("app.filterRecent") }}</option>
          </select>

          <button class="ghost" :disabled="!isAuthenticated || itemsState === 'loading'" @click="loadItems">
            {{ t("app.refresh") }}
          </button>
        </div>
      </div>

      <p class="feedback">{{ t("app.syncWindowHint") }}</p>
      <p v-if="itemsState === 'loading'" class="feedback">{{ t("app.itemsLoading") }}</p>
      <p v-else-if="itemError" class="feedback error">{{ itemError }}</p>
      <p v-else-if="!filteredItems.length" class="feedback">{{ t("app.itemsEmpty") }}</p>

      <div v-else class="item-list">
        <article v-for="item in filteredItems" :key="item.id" class="item-card">
          <template v-if="editingItemID === item.id">
            <div class="form-stack compact">
              <label class="field">
                <span>{{ t("app.itemTitle") }}</span>
                <input v-model="editForm.title" type="text" />
              </label>

              <label class="field">
                <span>{{ t("app.itemBody") }}</span>
                <textarea v-model="editForm.body" rows="3" />
              </label>

              <label class="field">
                <span>{{ t("app.remindAt") }}</span>
                <input v-model="editForm.remindAt" type="datetime-local" />
              </label>

              <label class="checkbox">
                <input v-model="editForm.deliverToTelegram" type="checkbox" />
                <span>{{ t("app.deliverToTelegram") }}</span>
              </label>

              <div class="inline-actions">
                <button class="primary" @click="saveEdit(item)">
                  {{ t("app.save") }}
                </button>
                <button class="ghost" @click="cancelEdit">{{ t("app.cancel") }}</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="item-head">
              <h3>{{ item.title }}</h3>
              <div class="inline-actions">
                <span class="pill neutral">v{{ item.version }}</span>
                <button class="ghost" @click="startEdit(item)">{{ t("app.edit") }}</button>
                <button class="danger" :disabled="deletingItemID === item.id" @click="removeItem(item)">
                  {{ deletingItemID === item.id ? t("app.deleting") : t("app.delete") }}
                </button>
              </div>
            </div>

            <p v-if="item.body" class="item-body">{{ item.body }}</p>

            <div class="item-meta">
              <span>{{ t("app.reminderLabel") }}: {{ formatDate(item.remind_at) }}</span>
              <span>{{ t("app.sourceLabel") }}: {{ item.source }}</span>
              <span>{{ t("app.updatedLabel") }}: {{ formatDate(item.updated_at) }}</span>
              <span>{{ t("app.telegramLabel") }}: {{ item.deliver_to_telegram ? t("app.yes") : t("app.no") }}</span>
            </div>
          </template>
        </article>
      </div>
    </section>
  </main>
</template>
