import { nodeStatus } from "app/base/enum";
import { MIN_PARTITION_SIZE } from "app/store/machine/constants";
import { DiskTypes } from "app/store/machine/types";
import type {
  Disk,
  Filesystem,
  Machine,
  Partition,
} from "app/store/machine/types";
import { formatBytes } from "app/utils";

/**
 * Returns whether a disk can be deleted.
 * @param disk - the disk to check.
 * @returns whether the disk can be deleted
 */
export const canBeDeleted = (disk: Disk | null): boolean => {
  if (!disk) {
    return false;
  }
  if (isVolumeGroup(disk)) {
    return disk.used_size === 0;
  }
  return !disk.partitions || disk.partitions.length === 0;
};

/**
 * Returns whether a filesystem can be formatted.
 * @param fs - the filesystem to check.
 * @returns whether the filesystem can be formatted
 */
export const canBeFormatted = (fs: Filesystem | null): boolean =>
  fs?.is_format_fstype || false;

/**
 * Returns whether a disk can be partitioned.
 * @param disk - the disk to check.
 * @returns whether the disk can be partitioned.
 */
export const canBePartitioned = (disk: Disk | null): boolean => {
  if (
    !disk ||
    isBcache(disk) ||
    isLogicalVolume(disk) ||
    isVolumeGroup(disk) ||
    isMounted(disk.filesystem)
  ) {
    return false;
  }

  // TODO: This does not take into account space that needs to be reserved.
  // https://github.com/canonical-web-and-design/MAAS-squad/issues/2274
  return disk.available_size >= MIN_PARTITION_SIZE;
};

/**
 * Returns whether a disk can create a logical volume.
 * @param disk - the disk to check.
 * @returns whether the disk can create a logical volume.
 */
export const canCreateLogicalVolume = (disk: Disk | null): boolean =>
  isVolumeGroup(disk) && diskAvailable(disk);

/**
 * Returns whether a list of storage devices can create a volume group.
 * @param storageDevices - the list of disks and partitions to check
 * @returns whether the list of storage devices can createa volume group
 */
export const canCreateVolumeGroup = (
  storageDevices: (Disk | Partition)[]
): boolean => {
  if (
    storageDevices.length === 0 ||
    storageDevices.some((device) => isFormatted(device.filesystem))
  ) {
    return false;
  }

  for (const device of storageDevices) {
    if (isDisk(device)) {
      if (device.partitions?.length > 0 || isVolumeGroup(device)) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Check whether a machine's OS supports bcache and ZFS.
 * @param machine - A machine object.
 * @returns Whether the machine's OS supports bcache and ZFS.
 */
export const canOsSupportBcacheZFS = (machine?: Machine | null): boolean =>
  !!machine && machine.osystem === "ubuntu";

/**
 * Check whether a machine's OS allows storage configuration.
 * @param machine - A machine object.
 * @returns Whether the machine's OS allows storage configuration.
 */
export const canOsSupportStorageConfig = (machine?: Machine | null): boolean =>
  !!machine && ["centos", "rhel", "ubuntu"].includes(machine.osystem);

/**
 * Returns whether a disk is available to use.
 * @param disk - the disk to check.
 * @returns whether the disk is available to use
 */
export const diskAvailable = (disk: Disk | null): boolean => {
  if (!disk || isCacheSet(disk) || isMounted(disk.filesystem)) {
    return false;
  }

  return disk.available_size >= MIN_PARTITION_SIZE;
};

/**
 * Formats a storage device's size for use in tables.
 * @param size - the size of the storage device in bytes.
 * @returns formatted size string.
 */
export const formatSize = (size: number | null): string => {
  const formatted = !!size && formatBytes(size, "B");
  return formatted ? `${formatted.value} ${formatted.unit}` : "—";
};

/**
 * Formats a storage device's type for use in tables.
 * @param storageDevice - the storage device to check.
 * @param sentenceForm - whether the returned string is used in a sentence.
 * @returns formatted type string.
 */
export const formatType = (
  storageDevice: Disk | Partition | null,
  sentenceForm = false
): string => {
  if (!storageDevice) {
    return "Unknown";
  }

  if (isPartition(storageDevice)) {
    return sentenceForm ? "partition" : "Partition";
  }

  let typeToFormat = storageDevice.type;
  const disk = storageDevice as Disk;
  if (isVirtual(disk)) {
    if (isLogicalVolume(disk)) {
      return sentenceForm ? "logical volume" : "Logical volume";
    } else if (isRaid(disk)) {
      const raidLevel = disk.parent?.type.split("-")[1];
      return raidLevel ? `RAID ${raidLevel}` : "RAID";
    }
    typeToFormat = disk.parent?.type || "Unknown";
  }

  switch (typeToFormat) {
    case DiskTypes.CACHE_SET:
      return sentenceForm ? "cache set" : "Cache set";
    case DiskTypes.ISCSI:
      return "ISCSI";
    case DiskTypes.VOLUME_GROUP:
      return sentenceForm ? "volume group" : "Volume group";
    case DiskTypes.PHYSICAL:
      return sentenceForm ? "physical disk" : "Physical";
    case DiskTypes.VIRTUAL:
      return sentenceForm ? "virtual disk" : "Virtual";
    case DiskTypes.VMFS6:
      return "VMFS6";
    default:
      return typeToFormat;
  }
};

/**
 * Returns a disk given the disk's id.
 * @param disks - the disks to check.
 * @param diskId - the disk id.
 * @returns disk that matches id.
 */
export const getDiskById = (disks: Disk[], diskId: Disk["id"]): Disk | null => {
  if (disks && disks.length > 0) {
    return disks.find((disk) => disk.id === diskId) || null;
  }
  return null;
};

/**
 * Returns a disk partition given the partition's id.
 * @param disks - the disks to check the partitions of.
 * @param partitionId - the partition id.
 * @returns partition that matches id.
 */
export const getPartitionById = (
  disks: Disk[],
  partitionId: Partition["id"]
): Partition | null => {
  if (disks && disks.length > 0) {
    for (const disk of disks) {
      if (disk.partitions) {
        for (const partition of disk.partitions) {
          if (partition.id === partitionId) {
            return partition;
          }
        }
      }
    }
  }
  return null;
};

/**
 * Returns whether a disk is a bcache.
 * @param disk - the disk to check.
 * @returns whether the disk is a bcache
 */
export const isBcache = (disk: Disk | null): boolean =>
  isVirtual(disk) && disk?.parent?.type === DiskTypes.BCACHE;

/**
 * Returns whether a disk is a cache set.
 * @param disk - the disk to check.
 * @returns whether the disk is a cache set
 */
export const isCacheSet = (disk: Disk | null): boolean =>
  disk?.type === DiskTypes.CACHE_SET;

/**
 * Returns whether a filesystem is a VMFS6 datastore.
 * @param fs - the filesystem to check.
 * @returns whether the filesystem is a VMFS6 datastore
 */
export const isDatastore = (fs: Filesystem | null): fs is Filesystem =>
  fs?.fstype === "vmfs6";

/**
 * Returns whether a storage device is a disk.
 * @param storageDevice - the storage device to check.
 * @returns whether the storage device is a disk
 */
export const isDisk = (
  storageDevice: Disk | Partition | null
): storageDevice is Disk =>
  Boolean(storageDevice) && storageDevice?.type !== "partition";

/**
 * Returns whether a filesystem is formatted.
 * @param fs - the filesystem to check.
 * @returns whether the filesystem is formatted
 */
export const isFormatted = (fs: Filesystem | null): boolean =>
  fs !== null && fs.fstype !== "";

/**
 * Returns whether a disk is a logical volume.
 * @param disk - the disk to check.
 * @returns whether the disk is a logical volume
 */
export const isLogicalVolume = (disk: Disk | null): boolean =>
  (isVirtual(disk) && disk?.parent?.type === DiskTypes.VOLUME_GROUP) || false;

/**
 * Check whether a machine's status allows storage configuration.
 * @param machine - A machine object.
 * @returns Whether the machine's status allows storage configuration.
 */
export const isMachineStorageConfigurable = (
  machine?: Machine | null
): boolean =>
  !!machine &&
  [nodeStatus.READY, nodeStatus.ALLOCATED].includes(machine.status_code);

/**
 * Returns whether a filesystem is mounted.
 * @param fs - the filesystem to check.
 * @returns whether the filesystem is mounted
 */
export const isMounted = (fs: Filesystem | null): fs is Filesystem => {
  if (!fs) {
    return false;
  }

  // VMware ESXi does not directly mount the partitions used. As MAAS can't
  // model that, a placeholder "RESERVED" is used for datastores so we know that
  // these partitions are in use.
  return fs.mount_point !== "" && fs.mount_point !== "RESERVED";
};

/**
 * Returns whether a storage device is a partition.
 * @param storageDevice - the storage device to check.
 * @returns whether the storage device is a partition
 */
export const isPartition = (storageDevice: Disk | Partition | null): boolean =>
  storageDevice?.type === "partition";

/**
 * Returns whether a disk is a physical disk.
 * @param disk - the disk to check.
 * @returns whether the disk is a physical disk
 */
export const isPhysical = (disk: Disk | null): boolean =>
  disk?.type === DiskTypes.PHYSICAL;

/**
 * Returns whether a disk is a RAID.
 * @param disk - the disk to check.
 * @returns whether the disk is a RAID
 */
export const isRaid = (disk: Disk | null): boolean =>
  (isVirtual(disk) && disk?.parent?.type.startsWith("raid-")) || false;

/**
 * Returns whether a disk is a virtual disk.
 * @param disk - the disk to check.
 * @returns whether the disk is a virtual disk
 */
export const isVirtual = (disk: Disk | null): boolean =>
  disk?.type === DiskTypes.VIRTUAL && "parent" in disk;

/**
 * Returns whether a disk is a volume group.
 * @param disk - the disk to check.
 * @returns whether the disk is a volume group
 */
export const isVolumeGroup = (disk: Disk | null): boolean =>
  disk?.type === DiskTypes.VOLUME_GROUP;

/**
 * Returns whether a partition is available to use.
 * @param partition - the partition to check.
 * @returns whether the partition is available to use
 */
export const partitionAvailable = (partition: Partition | null): boolean => {
  if (!partition || isMounted(partition.filesystem)) {
    return false;
  }

  return partition.filesystem === null || canBeFormatted(partition.filesystem);
};

/**
 * Returns whether a filesystem uses storage.
 * @param fs - the filesystem to check.
 * @returns whether the filesystem uses storage
 */
export const usesStorage = (fs: Filesystem | null): boolean => {
  if (!fs?.fstype) {
    return false;
  }
  return !["ramfs", "tmpfs"].includes(fs.fstype);
};
