/**
 * The privacy policy.
 *
 * Written to what the code actually does, not to a template. That turned out to be short,
 * because the app has no accounts, no server calls and no third-party scripts — so most
 * of a standard policy would be describing collection that does not happen.
 *
 * Two rules while writing it:
 *
 *   1. Every sentence had to be checkable against the source. Where the app *can* send
 *      something (a question to a language model, if the learner configures a key), it
 *      says so plainly rather than burying it.
 *   2. No "we may collect" hedging. Either it collects a thing or it does not; "may"
 *      exists to make future collection retroactively permitted, which is the opposite
 *      of informing anyone.
 *
 * tests/privacy.test.ts checks the claims that can be checked — that the analytics module
 * has no network transport, and that the policy names the one case where data does leave.
 */

export const PRIVACY_UPDATED = '2026-09-10';

export function PrivacyPolicy({ onClose }: { onClose?: () => void }) {
  return (
    <article className="privacy" aria-labelledby="privacy-title">
      <h2 id="privacy-title">Privacy</h2>
      <p className="tiny dim">Last updated {PRIVACY_UPDATED}.</p>

      <h3>The short version</h3>
      <p>
        Qurious has no accounts and no server of its own. Your lessons, your progress and
        every simulation run on your device. We do not have a copy of any of it, because
        there is nowhere for it to be sent.
      </p>

      <h3>What is stored, and where</h3>
      <p>
        Your progress — lessons finished, challenges solved, quiz answers, points, streak
        and badges — is kept in your browser’s local storage on this device. It is not
        synced, backed up, or visible to us. Clearing your browser data, or uninstalling
        the app, deletes it permanently.
      </p>

      <h3>What we collect</h3>
      <p>
        Nothing, unless you switch it on. There is an optional setting called “Help us test
        the app”. With it on, the app records which lessons and challenges you open and
        finish and how long they take — never anything you type. That record also stays on
        your device. It is sent nowhere; the only way it reaches us is if you press
        Download and choose to give us the file. Switching the setting off erases it.
      </p>

      <h3>The one time data leaves your device</h3>
      <p>
        The tutor answers from a built-in knowledge base that works offline. If you choose
        to connect a language model in Settings, and only then, your typed question is sent
        to the provider you picked — Groq, Google, OpenRouter, or your own server — under
        their privacy policy, not ours. Your API key is stored on your device and is sent
        only to that provider. Leave that setting empty and the app never contacts anyone.
      </p>

      <h3>Microphone and speech</h3>
      <p>
        The tutor can listen for “hey tutor” and can speak aloud. Speech recognition uses
        your device’s own system, and on Android that may involve the vendor’s speech
        service. Audio is not recorded, stored or sent by us. You can mute the tutor, and
        microphone permission can be revoked in your device settings at any time.
      </p>

      <h3>Cookies and tracking</h3>
      <p>
        None. No cookies, no advertising, no third-party analytics, no fingerprinting, no
        social media pixels. The app loads no scripts from anyone else at runtime.
      </p>

      <h3>Children</h3>
      <p>
        The app is built for students and collects no personal information, so there is
        nothing for us to hold about a learner of any age.
      </p>

      <h3>Changes</h3>
      <p>
        If this ever changes — an account system, sync, or anything that leaves the device
        by default — that will be stated here and in the app before it takes effect, not
        after.
      </p>

      {onClose && (
        <button className="btn btn-sm btn-primary" onClick={onClose}>Close</button>
      )}
    </article>
  );
}
