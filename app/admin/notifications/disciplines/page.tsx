"use client"

import { PageHeader } from "@/components/ui/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DisciplinesTab,
  JournalMappingTab,
  SectionMappingTab,
} from "@/src/features/notifications/components/config/discipline-config"

export default function NotificationDisciplinesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Disciplines" subtitle="Manage the discipline taxonomy and how journals map to it" />
      <Tabs defaultValue="disciplines" className="space-y-4">
        <TabsList>
          <TabsTrigger value="disciplines">Disciplines</TabsTrigger>
          <TabsTrigger value="journals">Journal mapping</TabsTrigger>
          <TabsTrigger value="sections">Section mapping</TabsTrigger>
        </TabsList>
        <TabsContent value="disciplines">
          <DisciplinesTab />
        </TabsContent>
        <TabsContent value="journals">
          <JournalMappingTab />
        </TabsContent>
        <TabsContent value="sections">
          <SectionMappingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
