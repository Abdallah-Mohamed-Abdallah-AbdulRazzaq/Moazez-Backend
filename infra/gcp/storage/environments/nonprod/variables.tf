variable "project_id" {
  description = "Existing non-production project; this root never creates it."
  type        = string
  default     = "moazez-nonprod-91001421934"

  validation {
    condition     = var.project_id == "moazez-nonprod-91001421934"
    error_message = "The nonprod root is locked to moazez-nonprod-91001421934."
  }
}
