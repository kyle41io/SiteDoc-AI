import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { LanguageProvider } from "@/i18n/provider";
import { LOCALE_LABELS } from "@/i18n/config";

function renderSwitcher() {
  return render(
    <LanguageProvider>
      <LanguageSwitcher />
    </LanguageProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("LanguageSwitcher", () => {
  it("opens the listbox and moves focus into it", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    const list = screen.getByRole("listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(list).toHaveFocus();
    // Every locale is offered as an option.
    expect(screen.getAllByRole("option")).toHaveLength(Object.keys(LOCALE_LABELS).length);
  });

  it("marks the current locale as the selected option", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button"));
    const selected = screen.getByRole("option", { selected: true });
    expect(selected).toHaveTextContent(LOCALE_LABELS.en);
  });

  it("selects a language with the keyboard and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole("button");
    await user.click(trigger);
    // ArrowDown from English (index 0) highlights the next locale, then Enter picks it.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent(LOCALE_LABELS.vi);
  });

  it("closes on Escape and returns focus to the trigger without changing locale", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole("button");
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    // Highlight moved but nothing was chosen, so the label is unchanged.
    expect(trigger).toHaveTextContent(LOCALE_LABELS.en);
  });

  it("selects a language by clicking its option", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    const trigger = screen.getByRole("button");
    await user.click(trigger);
    await user.click(within(screen.getByRole("listbox")).getByText(LOCALE_LABELS.es));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent(LOCALE_LABELS.es);
  });
});
