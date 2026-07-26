(() => {
  "use strict";

  const storage = window.localStorage;
  const sessionKey = "kuru-list:session";
  const visitKey = "kuru-list:last-visit";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function sessionId() {
    const current = storage.getItem(sessionKey);
    if (current && uuidPattern.test(current)) return current;
    const created = crypto.randomUUID();
    storage.setItem(sessionKey, created);
    return created;
  }

  async function jsonRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    let body = null;
    if (response.headers.get("content-type")?.includes("application/json")) {
      body = await response.json();
    }
    if (!response.ok) {
      const error = new Error(body?.error || "request_failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function telemetry(name) {
    void jsonRequest("/api/telemetry", {
      body: JSON.stringify({ name, sessionId: sessionId() }),
      method: "POST",
    }).catch(() => {});
  }

  const today = new Date().toISOString().slice(0, 10);
  const previousVisit = storage.getItem(visitKey);
  telemetry("visited");
  if (previousVisit && previousVisit !== today) telemetry("returned");
  storage.setItem(visitKey, today);

  function copyInput(id, button) {
    const input = document.getElementById(id);
    if (!(input instanceof HTMLInputElement)) return;
    void navigator.clipboard.writeText(input.value).then(() => {
      const original = button.textContent;
      button.textContent = "コピー済み";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1400);
    });
  }

  document.querySelectorAll("[data-copy-target]").forEach((element) => {
    element.addEventListener("click", () => {
      if (element instanceof HTMLButtonElement) {
        copyInput(element.dataset.copyTarget, element);
      }
    });
  });

  document.getElementById("copy-event-link")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    void navigator.clipboard.writeText(location.href).then(() => {
      button.textContent = "コピー済み";
      window.setTimeout(() => {
        button.textContent = "URLをコピー";
      }, 1400);
    });
  });

  function errorMessage(code) {
    return (
      {
        event_closed: "このイベントの受付は終了しています。",
        event_full: "参加枠が埋まりました。検討中または不参加なら回答できます。",
        invalid_admin_token: "管理用URLを確認できませんでした。",
        invalid_event: "入力内容を確認してください。",
        invalid_response: "表示名と回答を確認してください。",
        invalid_response_token: "この端末では回答を編集できません。",
        rate_limited: "操作が続きました。1分ほど待ってからお試しください。",
      }[code] || "送信できませんでした。少し待ってからお試しください。"
    );
  }

  function setError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.valueOf())) {
      return { day: "--", label: "日付を選択", month: "---", weekday: "" };
    }
    return {
      day: new Intl.DateTimeFormat("ja-JP", {
        day: "2-digit",
        timeZone: "UTC",
      }).format(date),
      label: new Intl.DateTimeFormat("ja-JP", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        weekday: "short",
        year: "numeric",
      }).format(date),
      month: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      })
        .format(date)
        .toUpperCase(),
      weekday: new Intl.DateTimeFormat("ja-JP", {
        timeZone: "UTC",
        weekday: "short",
      }).format(date),
    };
  }

  const createForm = document.getElementById("create-event-form");
  if (createForm instanceof HTMLFormElement) {
    const dateInput = document.getElementById("event-date");
    const twoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    if (dateInput instanceof HTMLInputElement) {
      dateInput.min = today;
      dateInput.value = twoWeeks;
    }
    const timezoneInput = document.getElementById("event-timezone");
    if (timezoneInput instanceof HTMLInputElement) {
      timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
    }

    const preview = document.querySelector(".event-preview");
    let selectedAccent = "coral";
    const fields = {
      capacity: document.getElementById("event-capacity"),
      date: dateInput,
      day: document.getElementById("preview-day"),
      dateLabel: document.getElementById("preview-date-label"),
      month: document.getElementById("preview-month"),
      title: document.getElementById("event-title"),
      titleLabel: document.getElementById("preview-event-title"),
      time: document.getElementById("start-time"),
      venue: document.getElementById("event-venue"),
      venueLabel: document.getElementById("preview-venue"),
      weekday: document.getElementById("preview-weekday"),
      capacityLabel: document.getElementById("preview-capacity"),
    };

    function updatePreview() {
      const date = formatDate(fields.date?.value || "");
      fields.day.textContent = date.day;
      fields.month.textContent = date.month;
      fields.weekday.textContent = date.weekday;
      fields.dateLabel.textContent = `${date.label} ${fields.time?.value || ""}`;
      fields.titleLabel.textContent = fields.title?.value.trim() || "イベント名";
      fields.venueLabel.textContent = fields.venue?.value.trim() || "場所未定";
      fields.capacityLabel.textContent =
        Number(fields.capacity?.value) > 0 ? fields.capacity.value : "上限なし";
    }

    createForm.querySelectorAll("input, textarea").forEach((element) => {
      element.addEventListener("input", updatePreview);
    });
    document.querySelectorAll(".accent-choices button").forEach((element) => {
      element.addEventListener("click", () => {
        selectedAccent = element.dataset.accent;
        preview.dataset.accent = selectedAccent;
        document.querySelectorAll(".accent-choices button").forEach((button) => {
          const selected = button === element;
          button.dataset.selected = String(selected);
          button.setAttribute("aria-pressed", String(selected));
        });
      });
    });
    updatePreview();

    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = createForm.querySelector('button[type="submit"]');
      const error = document.getElementById("create-error");
      setError(error, "");
      if (submit instanceof HTMLButtonElement) {
        submit.disabled = true;
        submit.firstChild.textContent = " 作成しています ";
      }
      const values = new FormData(createForm);
      try {
        const result = await jsonRequest("/api/events", {
          body: JSON.stringify({
            accent: selectedAccent,
            capacity: Number(values.get("capacity") || 0),
            details: values.get("details"),
            eventDate: values.get("eventDate"),
            sessionId: sessionId(),
            startTime: values.get("startTime"),
            timezone: values.get("timezone"),
            title: values.get("title"),
            venue: values.get("venue"),
            website: values.get("website"),
          }),
          method: "POST",
        });
        const share = `${location.origin}${result.sharePath}`;
        const manage = `${location.origin}${result.managePath}`;
        document.getElementById("share-url").value = share;
        document.getElementById("manage-url").value = manage;
        document.getElementById("open-manage").href = manage;
        createForm.closest(".create-workspace").hidden = true;
        const success = document.getElementById("create-success");
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
        telemetry("created");
      } catch (requestError) {
        setError(error, errorMessage(requestError.message));
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = false;
          submit.firstChild.textContent = " 参加ページを作る ";
        }
      }
    });
  }

  const eventPage = document.querySelector(".event-page");
  const responseForm = document.getElementById("response-form");
  if (eventPage instanceof HTMLElement && responseForm instanceof HTMLFormElement) {
    const eventId = eventPage.dataset.eventId;
    const storedKey = `kuru-list:response:${eventId}`;
    const statusButtons = [...document.querySelectorAll("[data-response-status]")];
    const deleteButton = document.getElementById("delete-response");
    const error = document.getElementById("response-error");
    let selectedStatus = "yes";
    let storedResponse = null;
    try {
      storedResponse = JSON.parse(storage.getItem(storedKey) || "null");
    } catch {
      storage.removeItem(storedKey);
    }

    if (storedResponse?.token && storedResponse?.id) {
      responseForm.elements.displayName.value = storedResponse.displayName || "";
      responseForm.elements.note.value = storedResponse.note || "";
      selectedStatus = storedResponse.status || "yes";
      deleteButton.hidden = false;
      responseForm.querySelector(".primary-button").textContent = "回答を更新";
    }

    function selectResponseStatus(status) {
      selectedStatus = status;
      statusButtons.forEach((button) => {
        const selected = button.dataset.responseStatus === status;
        button.dataset.selected = String(selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    }
    statusButtons.forEach((button) => {
      button.addEventListener("click", () => selectResponseStatus(button.dataset.responseStatus));
    });
    selectResponseStatus(selectedStatus);

    responseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError(error, "");
      const submit = responseForm.querySelector('.primary-button[type="submit"]');
      submit.disabled = true;
      const values = new FormData(responseForm);
      const payload = {
        displayName: values.get("displayName"),
        note: values.get("note"),
        sessionId: sessionId(),
        status: selectedStatus,
        website: values.get("website"),
      };
      try {
        const updating = storedResponse?.id && storedResponse?.token;
        const result = await jsonRequest(
          updating
            ? `/api/events/${eventId}/responses/${storedResponse.id}`
            : `/api/events/${eventId}/responses`,
          {
            body: JSON.stringify(payload),
            headers: updating ? { Authorization: `Bearer ${storedResponse.token}` } : {},
            method: updating ? "PUT" : "POST",
          },
        );
        storage.setItem(
          storedKey,
          JSON.stringify({
            displayName: payload.displayName,
            id: result.response.id,
            note: payload.note,
            status: payload.status,
            token: result.token || storedResponse.token,
          }),
        );
        telemetry("responded");
        location.reload();
      } catch (requestError) {
        submit.disabled = false;
        setError(error, errorMessage(requestError.message));
      }
    });

    deleteButton?.addEventListener("click", async () => {
      if (!storedResponse?.id || !storedResponse?.token) return;
      setError(error, "");
      try {
        await jsonRequest(`/api/events/${eventId}/responses/${storedResponse.id}`, {
          headers: { Authorization: `Bearer ${storedResponse.token}` },
          method: "DELETE",
        });
        storage.removeItem(storedKey);
        location.reload();
      } catch (requestError) {
        setError(error, errorMessage(requestError.message));
      }
    });
  }

  const managePage = document.querySelector(".manage-page");
  if (managePage instanceof HTMLElement) {
    const eventId = managePage.dataset.eventId;
    const token = location.hash.slice(1);
    const shareInput = document.getElementById("manage-share-url");
    if (shareInput instanceof HTMLInputElement) {
      shareInput.value = `${location.origin}/e/${eventId}`;
    }
    const controls = document.getElementById("manage-controls");
    const authState = document.getElementById("manage-auth-state");
    const authError = document.getElementById("manage-auth-error");
    const headers = { Authorization: `Bearer ${token}` };
    let currentStatus = document.getElementById("toggle-event")?.dataset.eventStatus || "open";

    jsonRequest(`/api/events/${eventId}/manage`, { headers })
      .then(() => {
        controls.hidden = false;
        authState.textContent = "管理用URLを確認しました";
        telemetry("managed");
      })
      .catch(() => {
        authState.textContent = "管理用URLを確認できませんでした";
        authError.hidden = false;
      });

    document.getElementById("print-roster")?.addEventListener("click", () => window.print());

    document.getElementById("download-csv")?.addEventListener("click", async () => {
      const response = await fetch(`/api/events/${eventId}/manage.csv`, { headers });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `kuru-list-${eventId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });

    const toggle = document.getElementById("toggle-event");
    toggle?.addEventListener("click", async () => {
      toggle.disabled = true;
      try {
        const action = currentStatus === "open" ? "close" : "open";
        const result = await jsonRequest(`/api/events/${eventId}/manage`, {
          body: JSON.stringify({ action }),
          headers,
          method: "PATCH",
        });
        currentStatus = result.status;
        toggle.textContent = currentStatus === "open" ? "参加受付を終了" : "参加受付を再開";
        toggle.disabled = false;
      } catch {
        toggle.disabled = false;
      }
    });

    document.getElementById("delete-event")?.addEventListener("click", async () => {
      if (!window.confirm("イベントとすべての回答を削除します。元に戻せません。")) return;
      try {
        await jsonRequest(`/api/events/${eventId}/manage`, { headers, method: "DELETE" });
        location.assign("/");
      } catch {
        authError.hidden = false;
      }
    });
  }
})();
