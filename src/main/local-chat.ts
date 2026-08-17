/**
 * Zero-cost responses for a deliberately tiny set of conversational turns.
 *
 * This is not presented as an AI model. It is the first stage of the product's
 * cost router: deterministic messages are answered locally, while anything
 * requiring reasoning continues to the authenticated managed/provider path.
 */
export function zeroCostChatReply(text: string): string | null {
    const normalized = text
        .trim()
        .toLowerCase()
        .replace(/[!?.,]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (/^(hi|hello|hey|hi there|hello there|hey there)$/.test(normalized)) {
        return 'Hi! What can I help you with?'
    }

    if (
        /^(hi |hello |hey )?(how are you|how are you doing|how's it going|hows it going)$/.test(
            normalized
        )
    ) {
        return 'I’m doing well—thanks for asking. What can I help you with?'
    }

    return null
}
