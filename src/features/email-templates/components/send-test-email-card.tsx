import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Send, Loader2 } from "lucide-react"

import { TestRecipientsField } from "@/src/features/notifications/components/test-recipients-field"

interface Props {
  recipients: string[]
  setRecipients: (next: string[]) => void
  savedRecipients: string[]
  sendingTest: boolean
  handleSendTest: () => void
}

export function SendTestEmailCard({ recipients, setRecipients, savedRecipients, sendingTest, handleSendTest }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Send Test Email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <TestRecipientsField
          id="template-test-recipients"
          recipients={recipients}
          onChange={setRecipients}
          saved={savedRecipients}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleSendTest}
          disabled={recipients.length === 0 || sendingTest}
        >
          {sendingTest ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {sendingTest ? "Sending..." : `Send Test (${recipients.length})`}
        </Button>
        <p className="text-xs text-muted-foreground">
          Sends a test email with sample variable values to each address. Requires SMTP to be configured.
        </p>
      </CardContent>
    </Card>
  )
}
