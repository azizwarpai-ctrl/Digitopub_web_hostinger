/**
 * Starter discipline taxonomy for the publication notification system.
 * Admins can rename, extend or deactivate every entry after seeding; the seed
 * only creates rows that do not exist yet (matched by `slug`).
 *
 * Synonyms are lowercase terms matched against researcher interests and OJS
 * article keywords (exact match first, then fuzzy).
 */

export interface DisciplineSeed {
    slug: string
    name: string
    synonyms: string[]
    children?: DisciplineSeed[]
}

export const DISCIPLINE_SEED: DisciplineSeed[] = [
    {
        slug: "dentistry",
        name: "Dentistry & Oral Health",
        synonyms: ["dentistry", "dental", "oral health", "stomatology", "dental medicine"],
        children: [
            {
                slug: "orthodontics",
                name: "Orthodontics",
                synonyms: ["orthodontics", "orthodontic", "clear aligners", "aligners", "malocclusion", "dentofacial orthopedics", "brackets"],
            },
            {
                slug: "endodontics",
                name: "Endodontics",
                synonyms: ["endodontics", "endodontic", "root canal", "root canal treatment", "pulp", "pulpitis", "apical periodontitis"],
            },
            {
                slug: "periodontology",
                name: "Periodontology",
                synonyms: ["periodontology", "periodontics", "periodontal", "periodontitis", "gingivitis", "gingiva", "peri-implantitis"],
            },
            {
                slug: "prosthodontics",
                name: "Prosthodontics",
                synonyms: ["prosthodontics", "prosthodontic", "dental prosthesis", "dentures", "crowns", "fixed prosthodontics", "removable prosthodontics"],
            },
            {
                slug: "implant-dentistry",
                name: "Implant Dentistry",
                synonyms: ["implantology", "dental implants", "implant dentistry", "osseointegration", "bone graft"],
            },
            {
                slug: "oral-maxillofacial-surgery",
                name: "Oral & Maxillofacial Surgery",
                synonyms: ["oral surgery", "maxillofacial surgery", "oral and maxillofacial surgery", "third molar", "orthognathic surgery", "tooth extraction"],
            },
            {
                slug: "oral-pathology",
                name: "Oral Pathology & Oral Medicine",
                synonyms: ["oral pathology", "oral medicine", "oral cancer", "oral lesions", "oral mucosa", "oral squamous cell carcinoma"],
            },
            {
                slug: "oral-radiology",
                name: "Oral & Maxillofacial Radiology",
                synonyms: ["oral radiology", "dental radiology", "cbct", "cone beam computed tomography", "dental imaging"],
            },
            {
                slug: "pediatric-dentistry",
                name: "Pediatric Dentistry",
                synonyms: ["pediatric dentistry", "paediatric dentistry", "pedodontics", "children's dentistry", "early childhood caries"],
            },
            {
                slug: "restorative-dentistry",
                name: "Restorative & Esthetic Dentistry",
                synonyms: ["restorative dentistry", "operative dentistry", "cariology", "dental caries", "esthetic dentistry", "aesthetic dentistry", "composite restorations"],
            },
            {
                slug: "dental-materials",
                name: "Dental Materials",
                synonyms: ["dental materials", "biomaterials", "zirconia", "composite resin", "adhesive dentistry", "ceramics"],
            },
            {
                slug: "digital-dentistry",
                name: "Digital Dentistry",
                synonyms: ["digital dentistry", "cad/cam", "cad cam", "intraoral scanning", "3d printing", "artificial intelligence in dentistry"],
            },
            {
                slug: "dental-public-health",
                name: "Dental Public Health",
                synonyms: ["dental public health", "community dentistry", "oral epidemiology", "preventive dentistry", "oral health promotion"],
            },
            {
                slug: "dental-education",
                name: "Dental Education",
                synonyms: ["dental education", "dental students", "dental curriculum"],
            },
        ],
    },
    {
        slug: "medicine",
        name: "Medicine & Health Sciences",
        synonyms: ["medicine", "medical sciences", "health sciences", "clinical medicine"],
        children: [
            {
                slug: "public-health",
                name: "Public Health & Epidemiology",
                synonyms: ["public health", "epidemiology", "global health", "health policy"],
            },
            {
                slug: "biomedical-sciences",
                name: "Biomedical Sciences",
                synonyms: ["biomedical sciences", "biomedicine", "molecular biology", "microbiology", "immunology", "pharmacology"],
            },
            {
                slug: "nursing",
                name: "Nursing",
                synonyms: ["nursing", "nurses", "nursing care"],
            },
        ],
    },
]
