# Lumina Key Rotation System Documentation (v2)

This document outlines the implementation and behavior of the API Key Rotation system within Lumina, following the latest refined strategy for reliability and balance.

## 1. General AI & Chat Logic (Sequential Rotation)

The chat logic is designed for seamless continuity and direct fallback.

### Core Mechanism
- **Start Point**: Every request starts using the **last successfully used API key** index, persisted in local storage.
- **Failover**: If the current key fails (Status 429 or other errors), the system automatically tries the **next key** in the pool.
- **Cycle Completion**: If the system rotates through all available keys and all fail, it notifies the user that the entire key pool is currently unresponsive.
- **Next Attempt**: The pointer remains at the last tried index, meaning the next request will start from where the last one left off, ensuring a continuous round-robin cycle.
- **No Permanent Blocking**: Keys are **never** marked as "Exhausted" for the day. This allows for immediate recovery if the provider's rate limit reset is shorter than 24 hours.

---

## 2. Anki Card Generation Logic (Cycle-based Sequential Rotation)

The Card Generator uses a structured sequential approach to process large volumes of data while respecting API limits.

### Core Mechanism
- **Sequential Processing**: Unlike the Worker Pool, this version processes batches **one-by-one**.
- **Key Rotation**:
    - For each successful batch, the system moves to the **next key** for the subsequent batch.
    - If a batch fails, the system **retries the same batch immediately** using the next key in the rotation.
- **The "Cycle" Rule**:
    - A "Cycle" is defined as a series of requests that utilize each API key in your list exactly once.
    - **15-Second Window**: A mandatory 15-second delay is enforced from the **start** of each cycle before a new cycle can begin. 
    - **500ms Batch Staggering**:
        - If a batch **succeeds**, the system ensures at least **500ms** pass before starting the next batch.
        - If a batch **fails**, the system **immediately** rotates the key and retries the same batch without waiting for the 500ms.
- **Persistence**: The index of the last successfully used key is saved and used as the starting point for the next generation session.

### Resilience
- **Indefinite Retries**: The system will continue to rotate through keys and cycles until the batch is either successfully generated or the user manually cancels.
- **Status Updates**: The UI provides real-time feedback on which batch is being processed, which key is being used, and the countdown for the next cycle wait time.

---

## 3. Comparative Summary

| Feature | Chat / General Logic | Card Generation Logic |
| :--- | :--- | :--- |
| **Execution Pattern** | Sequential Call | Sequential Batch Loop |
| **Failover** | Immediate next key | Immediate next key (stay on batch) |
| **Delay / Staggering** | None | 500ms (Success) / 15s (per Cycle) |
| **Exhaustion Logic** | None (Retries every time) | None (Immediate retry on failure) |
| **Storage** | Last successful index | Last successful index |

## 4. Why This Model?
This "Cycle-based" model prevents API providers from flagging the extension for bot-like behavior by ensuring a predictable, human-like cadence (15s minimum for key reuse) while still providing maximum uptime by utilizing all available keys in a redundant loop.
